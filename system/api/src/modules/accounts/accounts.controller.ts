import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { CostCenterType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { dayOf } from '../ledger/ledger.service';

@Controller('accounts')
export class AccountsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() @Require(P.ACCOUNTS_VIEW)
  list(@Query('q') q?: string, @Query('posting') posting?: string) {
    const where: Prisma.AccountWhereInput = {};
    if (q) where.OR = [{ code: { startsWith: q } }, { name: { contains: q, mode: 'insensitive' } }];
    if (posting === '1') { where.isPosting = true; where.active = true; }
    return this.prisma.account.findMany({ where, orderBy: { code: 'asc' }, take: q ? 50 : undefined });
  }

  @Get(':code') @Require(P.ACCOUNTS_VIEW)
  async one(@Param('code') code: string) {
    const a = await this.prisma.account.findUnique({ where: { code } });
    if (!a) throw new NotFoundException('الحساب غير موجود');
    const children = await this.prisma.account.findMany({ where: { parent: code }, orderBy: { code: 'asc' } });
    return { ...a, children };
  }

  @Post() @Require(P.ACCOUNTS_MANAGE)
  async create(@CurrentUser() u: AuthUser, @Body() b: { code: string; name: string; parent?: string; nature?: 'DEBIT' | 'CREDIT' }, @Meta() m: ReqMeta) {
    if (!/^\d{1,12}$/.test(b.code || '')) throw new BadRequestException('رمز الحساب أرقام فقط');
    if (!b.name?.trim()) throw new BadRequestException('اسم الحساب مطلوب');
    let level = 1, kind: 'BS' | 'PL' | 'TR' = 'BS', nature = b.nature ?? (['2', '4'].includes(b.code[0]) ? 'CREDIT' : 'DEBIT');
    if (b.parent) {
      const p = await this.prisma.account.findUnique({ where: { code: b.parent } });
      if (!p) throw new BadRequestException('الحساب الأب غير موجود');
      if (!b.code.startsWith(p.code) || b.code.length <= p.code.length) throw new BadRequestException('رمز الحساب يجب أن يبدأ برمز الحساب الأب');
      if (p.isPosting && (await this.prisma.journalLine.count({ where: { accountCode: p.code } })))
        throw new ConflictException('الحساب الأب عليه حركات، لا يمكن تحويله إلى حساب تجميعي');
      level = p.level + 1; kind = p.kind; nature = b.nature ?? p.nature;
    }
    const a = await this.prisma.$transaction(async (tx) => {
      if (b.parent) await tx.account.update({ where: { code: b.parent }, data: { isPosting: false } });
      return tx.account.create({ data: { code: b.code, name: b.name.trim(), parent: b.parent || null, level, kind, nature } });
    });
    await this.audit.log(u, 'CREATE', 'Account', a.code, { after: a }, m);
    return a;
  }

  @Patch(':code') @Require(P.ACCOUNTS_MANAGE)
  async update(@CurrentUser() u: AuthUser, @Param('code') code: string, @Body() b: { name?: string; active?: boolean }, @Meta() m: ReqMeta) {
    const before = await this.prisma.account.findUnique({ where: { code } });
    if (!before) throw new NotFoundException('الحساب غير موجود');
    const a = await this.prisma.account.update({ where: { code }, data: { name: b.name?.trim() || undefined, active: b.active } });
    await this.audit.log(u, 'UPDATE', 'Account', code, { before, after: a }, m);
    return a;
  }
}

@Controller('cost-centers')
export class CostCentersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() list() { return this.prisma.costCenter.findMany({ orderBy: [{ type: 'asc' }, { code: 'asc' }] }); }

  @Post() @Require(P.ACCOUNTS_MANAGE)
  async create(@CurrentUser() u: AuthUser, @Body() b: { code: string; name: string; type: CostCenterType }, @Meta() m: ReqMeta) {
    if (!b.code || !b.name || !['SPORT', 'DEPARTMENT', 'PROJECT'].includes(b.type)) throw new BadRequestException('بيانات مركز الكلفة غير مكتملة');
    const c = await this.prisma.costCenter.create({ data: { code: b.code.trim(), name: b.name.trim(), type: b.type } });
    await this.audit.log(u, 'CREATE', 'CostCenter', c.id, { after: c }, m);
    return c;
  }

  @Patch(':id') @Require(P.ACCOUNTS_MANAGE)
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { name?: string; active?: boolean }, @Meta() m: ReqMeta) {
    const c = await this.prisma.costCenter.update({ where: { id: +id }, data: { name: b.name, active: b.active } });
    await this.audit.log(u, 'UPDATE', 'CostCenter', id, { after: c }, m);
    return c;
  }
}

@Controller('currencies')
export class CurrenciesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() list() {
    return this.prisma.currency.findMany({ orderBy: { code: 'asc' }, include: { rates: { orderBy: { date: 'desc' }, take: 10 } } });
  }

  @Post('rates') @Require(P.ACCOUNTS_MANAGE)
  async setRate(@CurrentUser() u: AuthUser, @Body() b: { currency: string; date: string; rate: number }, @Meta() m: ReqMeta) {
    const cur = await this.prisma.currency.findUnique({ where: { code: b.currency } });
    if (!cur) throw new BadRequestException('العملة غير معرّفة');
    if (cur.isBase) throw new BadRequestException('سعر العملة الأساسية ثابت = 1');
    if (!(Number(b.rate) > 0)) throw new BadRequestException('سعر الصرف يجب أن يكون موجبًا');
    const date = dayOf(b.date);
    const r = await this.prisma.exchangeRate.upsert({
      where: { currency_date: { currency: b.currency, date } },
      update: { rate: new Prisma.Decimal(b.rate) }, create: { currency: b.currency, date, rate: new Prisma.Decimal(b.rate) },
    });
    await this.audit.log(u, 'SET_RATE', 'ExchangeRate', r.id, { after: r }, m);
    return r;
  }
}

@Controller('periods')
export class PeriodsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() list(@Query('year') year?: string) {
    return this.prisma.fiscalPeriod.findMany({ where: year ? { year: +year } : {}, orderBy: [{ year: 'desc' }, { month: 'asc' }] });
  }

  @Post(':year/:month/close') @Require(P.PERIODS_CLOSE)
  async close(@CurrentUser() u: AuthUser, @Param('year') y: string, @Param('month') mo: string, @Meta() m: ReqMeta) {
    const year = +y, month = +mo;
    const from = new Date(Date.UTC(year, month - 1, 1)), to = new Date(Date.UTC(year, month, 1));
    const pending = await this.prisma.journalEntry.count({ where: { date: { gte: from, lt: to }, status: { in: ['DRAFT', 'SUBMITTED'] } } });
    if (pending) throw new ConflictException(`يوجد ${pending} قيد غير مرحّل في هذه الفترة، رحّلها أو احذفها قبل الإقفال`);
    const p = await this.prisma.fiscalPeriod.upsert({
      where: { year_month: { year, month } }, update: { status: 'CLOSED', closedAt: new Date(), closedBy: u.id },
      create: { year, month, status: 'CLOSED', closedAt: new Date(), closedBy: u.id },
    });
    await this.audit.log(u, 'CLOSE', 'FiscalPeriod', `${year}-${month}`, { after: p }, m);
    return p;
  }

  @Post(':year/:month/reopen') @Require(P.SETTINGS_MANAGE)
  async reopen(@CurrentUser() u: AuthUser, @Param('year') y: string, @Param('month') mo: string, @Body() b: { reason?: string }, @Meta() m: ReqMeta) {
    if (!b.reason?.trim()) throw new BadRequestException('سبب إعادة الفتح مطلوب');
    const p = await this.prisma.fiscalPeriod.update({ where: { year_month: { year: +y, month: +mo } }, data: { status: 'OPEN', closedAt: null, closedBy: null } });
    await this.audit.log(u, 'REOPEN', 'FiscalPeriod', `${y}-${mo}`, { after: { ...p, reason: b.reason } }, m);
    return p;
  }
}
