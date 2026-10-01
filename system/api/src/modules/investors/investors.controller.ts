import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';

import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { dec, fromCents, toCents } from '../../common/money';
import { dayOf, LedgerService } from '../ledger/ledger.service';

type InvestorInput = { name: string; contractNo?: string; type: string; revenueAccount: string; receivableAcct?: string; startDate: string; endDate?: string;
  contractValue: number; currency: string; phone?: string; notes?: string; active?: boolean };

@Controller('investors')
export class InvestorsController {
  constructor(private prisma: PrismaService, private ledger: LedgerService, private audit: AuditService) {}

  @Get() @Require(P.INVESTORS_VIEW)
  async list() {
    const today = dayOf(new Date());
    const list = await this.prisma.investor.findMany({ include: { installments: { orderBy: { dueDate: 'asc' } } }, orderBy: { name: 'asc' } });
    return list.map((i) => {
      const paid = i.installments.filter((x) => x.paidAt).reduce((s, x) => s + toCents(x.amount), 0);
      const overdue = i.installments.filter((x) => !x.paidAt && x.dueDate < today);
      return { ...i, paid: fromCents(paid), remaining: fromCents(toCents(i.contractValue) - paid),
        overdueCount: overdue.length, overdueAmount: fromCents(overdue.reduce((s, x) => s + toCents(x.amount), 0)),
        nextDue: i.installments.find((x) => !x.paidAt)?.dueDate ?? null };
    });
  }

  @Get(':id') @Require(P.INVESTORS_VIEW)
  async one(@Param('id') id: string) {
    const i = await this.prisma.investor.findUnique({ where: { id: +id }, include: { installments: { orderBy: { dueDate: 'asc' } } } });
    if (!i) throw new NotFoundException('المستثمر غير موجود');
    return i;
  }

  private async check(b: InvestorInput) {
    if (!b.name?.trim() || !b.type || !b.startDate || !b.currency) throw new BadRequestException('بيانات العقد غير مكتملة');
    if (!(Number(b.contractValue) > 0)) throw new BadRequestException('قيمة العقد يجب أن تكون موجبة');
    const acc = await this.prisma.account.findUnique({ where: { code: b.revenueAccount } });
    if (!acc?.isPosting) throw new BadRequestException('حساب الإيراد يجب أن يكون حسابًا فرعيًا قابلًا للترحيل');
  }

  @Post() @Require(P.INVESTORS_MANAGE)
  async create(@CurrentUser() u: AuthUser, @Body() b: InvestorInput, @Meta() m: ReqMeta) {
    await this.check(b);
    const i = await this.prisma.investor.create({ data: { ...b, name: b.name.trim(), startDate: dayOf(b.startDate), endDate: b.endDate ? dayOf(b.endDate) : null, contractValue: dec(b.contractValue) } });
    await this.audit.log(u, 'CREATE', 'Investor', i.id, { after: i }, m);
    return i;
  }

  @Patch(':id') @Require(P.INVESTORS_MANAGE)
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: Partial<InvestorInput>, @Meta() m: ReqMeta) {
    const before = await this.prisma.investor.findUnique({ where: { id: +id } });
    if (!before) throw new NotFoundException('المستثمر غير موجود');
    const i = await this.prisma.investor.update({ where: { id: +id }, data: { ...b,
      startDate: b.startDate ? dayOf(b.startDate) : undefined, endDate: b.endDate ? dayOf(b.endDate) : undefined,
      contractValue: b.contractValue != null ? dec(b.contractValue) : undefined } });
    await this.audit.log(u, 'UPDATE', 'Investor', id, { before, after: i }, m);
    return i;
  }

  /** Splits the contract into `count` equal installments every `everyMonths` from `firstDue`. Replaces unpaid ones. */
  @Post(':id/schedule') @Require(P.INVESTORS_MANAGE)
  async schedule(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { count: number; firstDue: string; everyMonths?: number }, @Meta() m: ReqMeta) {
    const inv = await this.prisma.investor.findUnique({ where: { id: +id }, include: { installments: true } });
    if (!inv) throw new NotFoundException('المستثمر غير موجود');
    const count = Math.floor(+b.count), every = Math.floor(+(b.everyMonths || 1));
    if (!(count >= 1 && count <= 120) || !(every >= 1)) throw new BadRequestException('عدد الأقساط أو الفاصل غير صالح');
    const paid = inv.installments.filter((x) => x.paidAt).reduce((s, x) => s + toCents(x.amount), 0);
    const left = toCents(inv.contractValue) - paid;
    if (left <= 0) throw new ConflictException('العقد مسدد بالكامل');
    const each = Math.floor(left / count), first = dayOf(b.firstDue);
    const rows = Array.from({ length: count }, (_, k) => ({
      investorId: inv.id, amount: dec(fromCents(k === count - 1 ? left - each * (count - 1) : each)),
      dueDate: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + k * every, Math.min(first.getUTCDate(), 28))),
    }));
    await this.prisma.$transaction([this.prisma.installment.deleteMany({ where: { investorId: inv.id, paidAt: null } }), this.prisma.installment.createMany({ data: rows })]);
    await this.audit.log(u, 'SCHEDULE', 'Investor', id, { after: { count, every, firstDue: b.firstDue } }, m);
    return this.one(id);
  }

  /** Collects an installment: posts Dr cash / Cr revenue (or receivable) and marks it paid. */
  @Post('installments/:iid/collect') @Require(P.INVESTORS_MANAGE)
  async collect(@CurrentUser() u: AuthUser, @Param('iid') iid: string, @Body() b: { date: string; cashAccount: string; rate?: number }, @Meta() m: ReqMeta) {
    return this.prisma.$transaction(async (tx) => {
      const ins = await tx.installment.findUnique({ where: { id: +iid }, include: { investor: true } });
      if (!ins) throw new NotFoundException('القسط غير موجود');
      if (ins.paidAt) throw new ConflictException('القسط محصّل مسبقًا');
      const inv = ins.investor, amount = Number(ins.amount);
      const e = await this.ledger.createAndPost(u, {
        date: b.date, currency: inv.currency, rate: b.rate, description: `تحصيل قسط ${inv.type} — ${inv.name}`, party: inv.name, reference: inv.contractNo ?? undefined,
        lines: [{ accountCode: b.cashAccount, debit: amount }, { accountCode: inv.receivableAcct || inv.revenueAccount, credit: amount }],
      }, 'INVESTOR', m, tx);
      await tx.installment.update({ where: { id: ins.id }, data: { paidAt: dayOf(b.date), entryId: e.id } });
      return e;
    }, { timeout: 30000 });
  }
}

