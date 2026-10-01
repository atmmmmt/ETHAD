import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntrySource, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, ReqMeta } from '../../common/context';
import { dec, fromCents, toCents } from '../../common/money';
import { getSettings } from '../settings/settings.controller';

export type Tx = Prisma.TransactionClient;

export interface LineInput { accountCode: string; debit?: number; credit?: number; costCenterId?: number | null; memo?: string }
export interface EntryInput {
  date: string; description: string; reference?: string; party?: string;
  currency?: string; rate?: number; lines: LineInput[];
}

const dayOf = (s: string | Date) => {
  const d = typeof s === 'string' ? new Date(s.length === 10 ? s + 'T00:00:00Z' : s) : s;
  if (isNaN(d.getTime())) throw new BadRequestException('تاريخ غير صالح');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
export { dayOf };

/**
 * The posting engine. Every module that touches the ledger (manual entries,
 * vouchers, payroll, investors, imports) goes through here so that the
 * double-entry, period and numbering rules live in exactly one place.
 */
@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async baseCurrency(tx: Tx | PrismaService = this.prisma) {
    const c = await tx.currency.findFirst({ where: { isBase: true } });
    return c?.code ?? 'USD';
  }

  /** Units of base currency per 1 unit of `currency` on `date` (latest rate on or before). */
  async rateFor(currency: string, date: Date, tx: Tx | PrismaService = this.prisma) {
    const base = await this.baseCurrency(tx);
    if (currency === base) return 1;
    const cur = await tx.currency.findUnique({ where: { code: currency } });
    if (!cur) throw new BadRequestException(`العملة ${currency} غير معرّفة`);
    const r = await tx.exchangeRate.findFirst({ where: { currency, date: { lte: date } }, orderBy: { date: 'desc' } });
    if (!r) throw new BadRequestException(`لا يوجد سعر صرف لـ ${currency} بتاريخ ${date.toISOString().slice(0, 10)} أو قبله`);
    return Number(r.rate);
  }

  /** Validates lines and returns rows ready for insert, with base amounts balanced to the cent. */
  async buildLines(input: EntryInput, rate: number, tx: Tx | PrismaService = this.prisma) {
    const lines = (input.lines || []).filter((l) => toCents(l.debit) || toCents(l.credit));
    if (lines.length < 2) throw new BadRequestException('القيد يحتاج سطرين على الأقل');
    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await tx.account.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const ccIds = [...new Set(lines.map((l) => l.costCenterId).filter((x): x is number => !!x))];
    const ccs = ccIds.length ? await tx.costCenter.findMany({ where: { id: { in: ccIds }, active: true } }) : [];
    let dr = 0, cr = 0, drB = 0, crB = 0;
    const rows = lines.map((l, i) => {
      const a = byCode.get(l.accountCode);
      if (!a) throw new BadRequestException(`السطر ${i + 1}: الحساب ${l.accountCode} غير موجود`);
      if (!a.isPosting) throw new BadRequestException(`السطر ${i + 1}: الحساب ${a.code} ${a.name} حساب تجميعي ولا يقبل الترحيل`);
      if (!a.active) throw new BadRequestException(`السطر ${i + 1}: الحساب ${a.code} موقوف`);
      if (l.costCenterId && !ccs.find((c) => c.id === l.costCenterId)) throw new BadRequestException(`السطر ${i + 1}: مركز الكلفة غير صالح`);
      const d = toCents(l.debit), c = toCents(l.credit);
      if (d < 0 || c < 0) throw new BadRequestException(`السطر ${i + 1}: لا يسمح بمبالغ سالبة`);
      if (d && c) throw new BadRequestException(`السطر ${i + 1}: السطر إما مدين أو دائن`);
      const db = Math.round(d * rate), cb = Math.round(c * rate);
      dr += d; cr += c; drB += db; crB += cb;
      return { lineNo: i + 1, accountCode: a.code, costCenterId: l.costCenterId || null, memo: l.memo?.slice(0, 300) || null, d, c, db, cb };
    });
    if (dr !== cr) throw new BadRequestException(`القيد غير متوازن: المدين ${fromCents(dr)} ≠ الدائن ${fromCents(cr)}`);
    // absorb FX rounding drift into the largest line on the short side
    const diff = drB - crB;
    if (diff) {
      const side = diff > 0 ? 'cb' : 'db';
      const target = rows.filter((r) => r[side] > 0).sort((x, y) => y[side] - x[side])[0];
      target[side] += Math.abs(diff);
      if (diff > 0) crB += diff; else drB -= diff;
    }
    return {
      total: fromCents(dr), totalBase: fromCents(drB),
      rows: rows.map((r) => ({ lineNo: r.lineNo, accountCode: r.accountCode, costCenterId: r.costCenterId, memo: r.memo,
        debit: dec(fromCents(r.d)), credit: dec(fromCents(r.c)), debitBase: dec(fromCents(r.db)), creditBase: dec(fromCents(r.cb)) })),
    };
  }

  async ensureOpenPeriod(date: Date, tx: Tx | PrismaService = this.prisma) {
    const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
    const p = await tx.fiscalPeriod.upsert({ where: { year_month: { year, month } }, update: {}, create: { year, month } });
    if (p.status === 'CLOSED') throw new ConflictException(`الفترة ${month}/${year} مقفلة`);
  }

  async createDraft(user: AuthUser, input: EntryInput, source: EntrySource, tx: Tx, extra: Partial<Prisma.JournalEntryUncheckedCreateInput> = {}) {
    if (!input.description?.trim()) throw new BadRequestException('البيان مطلوب');
    const date = dayOf(input.date);
    const currency = input.currency || (await this.baseCurrency(tx));
    const rate = input.rate && currency !== (await this.baseCurrency(tx)) ? input.rate : await this.rateFor(currency, date, tx);
    if (!(rate > 0)) throw new BadRequestException('سعر الصرف غير صالح');
    const { total, rows } = await this.buildLines({ ...input, currency }, rate, tx);
    return tx.journalEntry.create({
      data: {
        date, description: input.description.trim().slice(0, 500), reference: input.reference?.slice(0, 100) || null,
        party: input.party?.slice(0, 200) || null, source, currency, rate: new Prisma.Decimal(rate), total: dec(total),
        createdById: user.id, ...extra, lines: { create: rows },
      },
      include: { lines: true },
    });
  }

  /** Assigns the next gap-free number and posts. Caller must already be inside a transaction. */
  async postInTx(entryId: number, user: AuthUser, tx: Tx) {
    const e = await tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true } });
    if (!e) throw new NotFoundException('القيد غير موجود');
    if (e.status === 'POSTED' || e.status === 'REVERSED') throw new ConflictException('القيد مرحّل مسبقًا');
    await this.ensureOpenPeriod(e.date, tx);
    const d = e.lines.reduce((s, l) => s + toCents(l.debitBase), 0), c = e.lines.reduce((s, l) => s + toCents(l.creditBase), 0);
    if (d !== c || d === 0) throw new ConflictException('القيد غير متوازن بالعملة الأساسية');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7701)`;
    const max = await tx.journalEntry.aggregate({ _max: { number: true } });
    return tx.journalEntry.update({
      where: { id: e.id },
      data: { status: 'POSTED', number: (max._max.number ?? 0) + 1, postedAt: new Date(), approvedById: user.id },
      include: { lines: true },
    });
  }

  /** Create + post in one step (system-generated entries: payroll, investors, imports, vouchers). */
  async createAndPost(user: AuthUser, input: EntryInput, source: EntrySource, meta: ReqMeta, tx?: Tx, extra: Partial<Prisma.JournalEntryUncheckedCreateInput> = {}) {
    const run = async (t: Tx) => {
      const draft = await this.createDraft(user, input, source, t, extra);
      const posted = await this.postInTx(draft.id, user, t);
      await this.audit.log(user, 'POST', 'JournalEntry', posted.id, { after: { number: posted.number, source, total: posted.total } }, meta, t);
      return posted;
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 60000 });
  }

  /** Submit for approval; small entries post immediately, larger ones wait for an approver. */
  async submit(id: number, user: AuthUser, meta: ReqMeta) {
    const s = await getSettings(this.prisma);
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.journalEntry.findUnique({ where: { id }, include: { lines: true } });
      if (!e) throw new NotFoundException('القيد غير موجود');
      if (!['DRAFT', 'REJECTED'].includes(e.status)) throw new ConflictException('لا يمكن إرسال قيد بهذه الحالة');
      const totalBase = fromCents(e.lines.reduce((x, l) => x + toCents(l.debitBase), 0));
      if (totalBase <= s.approvalThreshold) {
        const p = await this.postInTx(id, user, tx);
        await this.audit.log(user, 'POST', 'JournalEntry', id, { after: { number: p.number, totalBase } }, meta, tx);
        return p;
      }
      const r = await tx.journalEntry.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), rejectReason: null } });
      await this.audit.log(user, 'SUBMIT', 'JournalEntry', id, { after: { totalBase } }, meta, tx);
      return r;
    });
  }

  async approve(id: number, user: AuthUser, meta: ReqMeta) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.journalEntry.findUnique({ where: { id } });
      if (!e) throw new NotFoundException('القيد غير موجود');
      if (e.status !== 'SUBMITTED') throw new ConflictException('القيد ليس بانتظار الاعتماد');
      if (e.createdById === user.id && user.role !== 'ADMIN') throw new ForbiddenException('لا يمكن اعتماد قيد أنشأته بنفسك (فصل المهام)');
      const p = await this.postInTx(id, user, tx);
      await this.audit.log(user, 'APPROVE', 'JournalEntry', id, { after: { number: p.number } }, meta, tx);
      return p;
    });
  }

  async reject(id: number, reason: string, user: AuthUser, meta: ReqMeta) {
    if (!reason?.trim()) throw new BadRequestException('سبب الرفض مطلوب');
    const e = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!e || e.status !== 'SUBMITTED') throw new ConflictException('القيد ليس بانتظار الاعتماد');
    const r = await this.prisma.journalEntry.update({ where: { id }, data: { status: 'REJECTED', rejectReason: reason.slice(0, 500) } });
    await this.audit.log(user, 'REJECT', 'JournalEntry', id, { after: { reason } }, meta);
    return r;
  }

  /** A posted entry is never edited: it is cancelled by a mirror entry. */
  async reverse(id: number, user: AuthUser, meta: ReqMeta, date?: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.journalEntry.findUnique({ where: { id }, include: { lines: true, reversedBy: true } });
      if (!e) throw new NotFoundException('القيد غير موجود');
      if (e.status !== 'POSTED') throw new ConflictException('يمكن عكس القيود المرحّلة فقط');
      if (e.reversedBy || e.source === 'REVERSAL') throw new ConflictException('هذا القيد معكوس أو هو قيد عكسي');
      const d = date ? dayOf(date) : e.date;
      await this.ensureOpenPeriod(d, tx);
      const rev = await tx.journalEntry.create({
        data: {
          date: d, description: `عكس القيد رقم ${e.number}${reason ? ' — ' + reason.slice(0, 200) : ''}`, reference: e.reference,
          party: e.party, source: 'REVERSAL', currency: e.currency, rate: e.rate, total: e.total, createdById: user.id, reversesId: e.id,
          lines: { create: e.lines.map((l) => ({ lineNo: l.lineNo, accountCode: l.accountCode, costCenterId: l.costCenterId, memo: l.memo,
            debit: l.credit, credit: l.debit, debitBase: l.creditBase, creditBase: l.debitBase })) },
        },
      });
      const p = await this.postInTx(rev.id, user, tx);
      await tx.journalEntry.update({ where: { id: e.id }, data: { status: 'REVERSED' } });
      await this.audit.log(user, 'REVERSE', 'JournalEntry', e.id, { after: { reversalId: p.id, reversalNumber: p.number, reason } }, meta, tx);
      return p;
    });
  }
}
