import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { fromCents, toCents } from '../../common/money';
import { getSettings } from '../settings/settings.controller';

@Controller('budgets')
export class BudgetsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Budgets of a year with actuals, % used and alert level. */
  @Get() @Require(P.BUDGETS_VIEW)
  async list(@Query('year') y: string) {
    const year = +y || new Date().getFullYear();
    const { budgetAlerts } = await getSettings(this.prisma);
    const budgets = await this.prisma.budget.findMany({ where: { year }, include: { account: true, costCenter: true }, orderBy: [{ costCenterId: 'asc' }, { accountCode: 'asc' }] });
    const from = new Date(Date.UTC(year, 0, 1)), to = new Date(Date.UTC(year + 1, 0, 1));
    return Promise.all(budgets.map(async (b) => {
      const where: Prisma.JournalLineWhereInput = { entry: { status: { in: ['POSTED', 'REVERSED'] }, date: { gte: from, lt: to } } };
      where.accountCode = b.accountCode ? { startsWith: b.accountCode } : { startsWith: '3' };
      if (b.costCenterId) where.costCenterId = b.costCenterId;
      const s = await this.prisma.journalLine.aggregate({ where, _sum: { debitBase: true, creditBase: true } });
      const revenue = b.accountCode?.startsWith('4');
      const actual = revenue ? toCents(s._sum.creditBase) - toCents(s._sum.debitBase) : toCents(s._sum.debitBase) - toCents(s._sum.creditBase);
      const budget = toCents(b.amount);
      const pct = budget ? Math.round((actual / budget) * 1000) / 10 : 0;
      const alert = revenue ? null : [...budgetAlerts].reverse().find((t) => pct >= t) ?? null;
      return { id: b.id, year, accountCode: b.accountCode, accountName: b.account?.name ?? 'كل النفقات', costCenterId: b.costCenterId,
        costCenter: b.costCenter?.name ?? 'كل المراكز', type: revenue ? 'REVENUE' : 'EXPENSE', note: b.note,
        amount: fromCents(budget), actual: fromCents(actual), remaining: fromCents(budget - actual), pct, alert };
    }));
  }

  @Post() @Require(P.BUDGETS_MANAGE)
  async upsert(@CurrentUser() u: AuthUser, @Body() b: { year: number; accountCode?: string; costCenterId?: number; amount: number; note?: string }, @Meta() m: ReqMeta) {
    if (!b.year || !(Number(b.amount) >= 0)) throw new BadRequestException('السنة والمبلغ مطلوبان');
    if (!b.accountCode && !b.costCenterId) throw new BadRequestException('حدد حسابًا أو مركز كلفة');
    const data = { year: +b.year, accountCode: b.accountCode || null, costCenterId: b.costCenterId || null, amount: new Prisma.Decimal(Number(b.amount).toFixed(2)), note: b.note || null };
    const existing = await this.prisma.budget.findFirst({ where: { year: data.year, accountCode: data.accountCode, costCenterId: data.costCenterId } });
    const r = existing ? await this.prisma.budget.update({ where: { id: existing.id }, data }) : await this.prisma.budget.create({ data });
    await this.audit.log(u, existing ? 'UPDATE' : 'CREATE', 'Budget', r.id, { before: existing, after: r }, m);
    return r;
  }

  @Delete(':id') @Require(P.BUDGETS_MANAGE)
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) {
    const r = await this.prisma.budget.delete({ where: { id: +id } });
    await this.audit.log(u, 'DELETE', 'Budget', id, { before: r }, m);
    return { ok: true };
  }
}
