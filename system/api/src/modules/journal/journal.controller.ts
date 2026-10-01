import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { EntryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { dayOf, EntryInput, LedgerService } from '../ledger/ledger.service';

const OPENING_EQUITY = '220001'; // الأرصدة الافتتاحية

@Controller('journal')
export class JournalController {
  constructor(private prisma: PrismaService, private ledger: LedgerService, private audit: AuditService) {}

  @Get() @Require(P.JOURNAL_VIEW)
  async list(@Query() q: { status?: EntryStatus; from?: string; to?: string; q?: string; account?: string; source?: string; page?: string; size?: string }) {
    const where: Prisma.JournalEntryWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.source) where.source = q.source as any;
    if (q.from || q.to) where.date = { gte: q.from ? dayOf(q.from) : undefined, lte: q.to ? dayOf(q.to) : undefined };
    if (q.q) where.OR = [{ description: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q } }, { party: { contains: q.q, mode: 'insensitive' } },
      ...(/^\d+$/.test(q.q) ? [{ number: +q.q }] : [])];
    if (q.account) where.lines = { some: { accountCode: { startsWith: q.account } } };
    const size = Math.min(+(q.size || 50), 200), page = Math.max(+(q.page || 1), 1);
    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (page - 1) * size, take: size }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { items, total, page, size };
  }

  @Get(':id') @Require(P.JOURNAL_VIEW)
  async one(@Param('id') id: string) {
    const e = await this.prisma.journalEntry.findUnique({
      where: { id: +id },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { account: { select: { name: true } }, costCenter: { select: { name: true } } } }, reverses: { select: { id: true, number: true } }, reversedBy: { select: { id: true, number: true } } },
    });
    if (!e) throw new NotFoundException('القيد غير موجود');
    const users = await this.prisma.user.findMany({ where: { id: { in: [e.createdById, e.approvedById ?? 0] } }, select: { id: true, fullName: true } });
    return { ...e, createdBy: users.find((x) => x.id === e.createdById)?.fullName, approvedBy: users.find((x) => x.id === e.approvedById)?.fullName };
  }

  @Post() @Require(P.JOURNAL_CREATE)
  async create(@CurrentUser() u: AuthUser, @Body() b: EntryInput, @Meta() m: ReqMeta) {
    const e = await this.prisma.$transaction((tx) => this.ledger.createDraft(u, b, 'MANUAL', tx));
    await this.audit.log(u, 'CREATE', 'JournalEntry', e.id, { after: b }, m);
    return e;
  }

  @Put(':id') @Require(P.JOURNAL_CREATE)
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: EntryInput, @Meta() m: ReqMeta) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.journalEntry.findUnique({ where: { id: +id }, include: { lines: true } });
      if (!e) throw new NotFoundException('القيد غير موجود');
      if (!['DRAFT', 'REJECTED'].includes(e.status)) throw new ConflictException('لا يمكن تعديل قيد مرسل أو مرحّل');
      if (e.createdById !== u.id && u.role !== 'ADMIN') throw new ConflictException('يعدّل القيد منشئه فقط');
      const date = dayOf(b.date);
      const currency = b.currency || e.currency;
      const rate = b.rate || (await this.ledger.rateFor(currency, date, tx));
      const { total, rows } = await this.ledger.buildLines({ ...b, currency }, rate, tx);
      await tx.journalLine.deleteMany({ where: { entryId: e.id } });
      const r = await tx.journalEntry.update({
        where: { id: e.id },
        data: { date, description: b.description, reference: b.reference || null, party: b.party || null, currency, rate: new Prisma.Decimal(rate),
          total: new Prisma.Decimal(total.toFixed(2)), status: 'DRAFT', lines: { create: rows } },
        include: { lines: true },
      });
      await this.audit.log(u, 'UPDATE', 'JournalEntry', e.id, { before: e, after: b }, m, tx);
      return r;
    });
  }

  @Delete(':id') @Require(P.JOURNAL_CREATE)
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) {
    const e = await this.prisma.journalEntry.findUnique({ where: { id: +id }, include: { lines: true } });
    if (!e) throw new NotFoundException('القيد غير موجود');
    if (!['DRAFT', 'REJECTED'].includes(e.status)) throw new ConflictException('لا يحذف إلا القيد المسودة — القيد المرحّل يُعكس');
    await this.prisma.journalEntry.delete({ where: { id: e.id } });
    await this.audit.log(u, 'DELETE', 'JournalEntry', e.id, { before: e }, m);
    return { ok: true };
  }

  @Post(':id/submit') @Require(P.JOURNAL_CREATE)
  submit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) { return this.ledger.submit(+id, u, m); }

  @Post(':id/approve') @Require(P.JOURNAL_APPROVE)
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) { return this.ledger.approve(+id, u, m); }

  @Post(':id/reject') @Require(P.JOURNAL_APPROVE)
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { reason: string }, @Meta() m: ReqMeta) { return this.ledger.reject(+id, b.reason, u, m); }

  @Post(':id/reverse') @Require(P.JOURNAL_REVERSE)
  reverse(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { date?: string; reason?: string }, @Meta() m: ReqMeta) {
    if (!b.reason?.trim()) throw new BadRequestException('سبب العكس مطلوب');
    return this.ledger.reverse(+id, u, m, b.date, b.reason);
  }
}

/** Receipt / payment vouchers: a friendlier front for two-line entries. */
@Controller('vouchers')
export class VouchersController {
  constructor(private ledger: LedgerService) {}

  @Post() @Require(P.JOURNAL_CREATE)
  create(@CurrentUser() u: AuthUser, @Meta() m: ReqMeta, @Body() b: {
    type: 'RECEIPT' | 'PAYMENT'; date: string; cashAccount: string; counterAccount: string; amount: number;
    currency?: string; rate?: number; description: string; party?: string; reference?: string; costCenterId?: number;
  }) {
    if (!['RECEIPT', 'PAYMENT'].includes(b.type)) throw new BadRequestException('نوع السند غير صالح');
    if (!(Number(b.amount) > 0)) throw new BadRequestException('المبلغ يجب أن يكون موجبًا');
    const cash = { accountCode: b.cashAccount, memo: b.description };
    const other = { accountCode: b.counterAccount, costCenterId: b.costCenterId, memo: b.description };
    const lines = b.type === 'RECEIPT'
      ? [{ ...cash, debit: b.amount }, { ...other, credit: b.amount }]
      : [{ ...other, debit: b.amount }, { ...cash, credit: b.amount }];
    return this.ledger.createAndPost(u, { ...b, lines }, b.type, m);
  }
}

/** Opening balances: one posted OPENING entry, balanced against 220001. */
@Controller('opening')
export class OpeningController {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  @Get() @Require(P.JOURNAL_VIEW)
  list() { return this.prisma.journalEntry.findMany({ where: { source: 'OPENING' }, orderBy: { date: 'asc' } }); }

  @Post() @Require(P.IMPORT_RUN)
  async create(@CurrentUser() u: AuthUser, @Meta() m: ReqMeta, @Body() b: { date: string; currency?: string; rate?: number; lines: { accountCode: string; debit?: number; credit?: number }[] }) {
    const lines = buildOpeningLines(b.lines);
    return this.ledger.createAndPost(u, { date: b.date, currency: b.currency, rate: b.rate, description: 'الأرصدة الافتتاحية', lines }, 'OPENING', m);
  }
}

export function buildOpeningLines(input: { accountCode: string; debit?: number; credit?: number }[]) {
  const lines = input.filter((l) => l.accountCode !== OPENING_EQUITY).map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }));
  const diff = Math.round(lines.reduce((s, l) => s + l.debit * 100 - l.credit * 100, 0));
  if (diff) lines.push({ accountCode: OPENING_EQUITY, debit: diff < 0 ? -diff / 100 : 0, credit: diff > 0 ? diff / 100 : 0 });
  return lines;
}
