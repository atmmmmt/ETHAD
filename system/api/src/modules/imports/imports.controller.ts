import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { fromCents, toCents } from '../../common/money';
import { dayOf, LedgerService } from '../ledger/ledger.service';
import { buildOpeningLines } from '../journal/journal.controller';

type Kind = 'accounts' | 'balances' | 'transactions';
type Row = Record<string, string | number | null> & { _row: number };
interface Issue { row: number; level: 'error' | 'warning'; message: string }

const ALIASES: Record<string, string[]> = {
  code: ['رمز الحساب', 'رقم الحساب', 'الرمز', 'الحساب', 'code', 'account'],
  name: ['اسم الحساب', 'الاسم', 'name'],
  debit: ['مدين', 'المدين', 'debit'],
  credit: ['دائن', 'الدائن', 'credit'],
  balance: ['الرصيد', 'رصيد', 'balance'],
  date: ['التاريخ', 'تاريخ', 'date'],
  ref: ['رقم القيد', 'المرجع', 'رقم المستند', 'ref', 'entry'],
  description: ['البيان', 'الشرح', 'description', 'memo'],
  costCenter: ['مركز الكلفة', 'مركز التكلفة', 'cost center', 'costcenter'],
  currency: ['العملة', 'currency'],
  rate: ['سعر الصرف', 'المعادل', 'rate'],
};
const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const cellVal = (v: ExcelJS.CellValue): string | number | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') { const o = v as any; return o.result ?? o.text ?? (o.richText ? o.richText.map((t: any) => t.text).join('') : null); }
  return v as string | number;
};
const amount = (v: unknown) => { if (v == null || v === '') return 0; const n = Number(String(v).replace(/[,\s]/g, '')); return isFinite(n) ? n : NaN; };

/** Reads the first sheet; header = first row within the top 15 that names a code column. */
async function readSheet(buf: Buffer, fileName: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) { const { Readable } = await import('stream'); await wb.csv.read(Readable.from(buf)); }
  else if (/\.xlsx$/i.test(fileName)) await wb.xlsx.load(buf as any);
  else throw new BadRequestException('الصيغ المدعومة: xlsx أو csv — احفظ ملف xls بصيغة xlsx من Excel');
  const ws = wb.worksheets[0];
  if (!ws) throw new BadRequestException('الملف فارغ');
  let headerRow = 0; const map: Record<number, string> = {};
  for (let r = 1; r <= Math.min(15, ws.rowCount) && !headerRow; r++) {
    const row = ws.getRow(r);
    const found: Record<number, string> = {};
    row.eachCell((c, col) => { const t = norm(cellVal(c.value)); for (const [k, al] of Object.entries(ALIASES)) if (al.some((a) => t === norm(a))) found[col] = found[col] ?? k; });
    if (Object.values(found).includes('code')) { headerRow = r; Object.assign(map, found); }
  }
  if (!headerRow) throw new BadRequestException('لم يُعثر على صف العناوين (يجب أن يحتوي عمود "رمز الحساب")');
  const rows: Row[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), o: Row = { _row: r };
    for (const [col, key] of Object.entries(map)) o[key] = cellVal(row.getCell(+col).value);
    if (Object.entries(o).some(([k, v]) => k !== '_row' && v != null && v !== '')) rows.push(o);
  }
  return rows;
}

@Controller('imports')
export class ImportsController {
  constructor(private prisma: PrismaService, private ledger: LedgerService, private audit: AuditService) {}

  @Get() @Require(P.IMPORT_RUN)
  list() { return this.prisma.importBatch.findMany({ orderBy: { id: 'desc' }, select: { id: true, kind: true, fileName: true, status: true, createdAt: true, issues: true, stats: true } })
    .then((l) => l.map(({ stats, ...b }) => ({ ...b, summary: (stats as any)?.summary }))); }

  @Get(':id') @Require(P.IMPORT_RUN)
  async one(@Param('id') id: string) {
    const b = await this.prisma.importBatch.findUnique({ where: { id: +id } });
    if (!b) throw new NotFoundException('الدفعة غير موجودة');
    return { ...b, stats: { summary: (b.stats as any)?.summary } };
  }

  /** Step 1 — dry run: parse and validate, store as VALIDATED. Nothing touches the ledger. */
  @Post('validate') @Require(P.IMPORT_RUN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async validate(@CurrentUser() u: AuthUser, @UploadedFile() file: { buffer: Buffer; originalname: string }, @Body() b: { kind: Kind; date?: string; currency?: string }, @Meta() m: ReqMeta) {
    if (!file) throw new BadRequestException('أرفق ملفًا');
    if (!['accounts', 'balances', 'transactions'].includes(b.kind)) throw new BadRequestException('نوع الاستيراد غير صالح');
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const rows = await readSheet(file.buffer, fileName);
    const { issues, payload, summary } = await this.check(b.kind, rows, b);
    const ok = !issues.some((i) => i.level === 'error');
    const batch = await this.prisma.importBatch.create({ data: { kind: b.kind, fileName, status: ok ? 'VALIDATED' : 'FAILED',
      stats: { summary, payload, options: { date: b.date, currency: b.currency } } as any, issues: issues.slice(0, 2000) as any, createdBy: u.id } });
    await this.audit.log(u, 'IMPORT_VALIDATE', 'ImportBatch', batch.id, { after: { kind: b.kind, fileName, summary, errors: issues.filter((i) => i.level === 'error').length } }, m);
    return { id: batch.id, status: batch.status, summary, issues: issues.slice(0, 500) };
  }

  private async check(kind: Kind, rows: Row[], opt: { date?: string; currency?: string }) {
    const issues: Issue[] = [];
    const err = (row: number, message: string) => issues.push({ row, level: 'error', message });
    const accounts = new Map((await this.prisma.account.findMany()).map((a) => [a.code, a]));
    const code = (r: Row) => String(r.code ?? '').replace(/\.0+$/, '').trim();

    if (kind === 'accounts') {
      const payload: { code: string; name: string }[] = []; let existing = 0;
      for (const r of rows) {
        const c = code(r), name = String(r.name ?? '').trim();
        if (!/^\d+$/.test(c)) { err(r._row, `رمز غير صالح "${c}"`); continue; }
        if (!name) { err(r._row, 'اسم الحساب فارغ'); continue; }
        if (accounts.has(c)) { existing++; if (accounts.get(c)!.name !== name) issues.push({ row: r._row, level: 'warning', message: `الحساب ${c} موجود باسم مختلف: "${accounts.get(c)!.name}"` }); continue; }
        payload.push({ code: c, name });
      }
      return { issues, payload, summary: { rows: rows.length, new: payload.length, existing } };
    }

    const checkAccount = (r: Row, c: string) => {
      const a = accounts.get(c);
      if (!a) return err(r._row, `الحساب ${c} غير موجود في الدليل — استورد الدليل أولًا`), false;
      if (!a.isPosting) return err(r._row, `الحساب ${c} ${a.name} تجميعي`), false;
      return true;
    };
    const side = (r: Row) => {
      let d = amount(r.debit), c = amount(r.credit);
      if (r.balance != null && r.debit == null && r.credit == null) { const v = amount(r.balance); d = v > 0 ? v : 0; c = v < 0 ? -v : 0; }
      if (isNaN(d) || isNaN(c)) { err(r._row, 'مبلغ غير رقمي'); return null; }
      if (d < 0 || c < 0) { const n = d - c; d = n > 0 ? n : 0; c = n < 0 ? -n : 0; }
      return { d: toCents(d), c: toCents(c) };
    };

    if (kind === 'balances') {
      if (!opt.date) err(0, 'حدد تاريخ الأرصدة الافتتاحية');
      if (await this.prisma.journalEntry.count({ where: { source: 'OPENING', status: 'POSTED' } })) issues.push({ row: 0, level: 'warning', message: 'يوجد قيد أرصدة افتتاحية مرحّل مسبقًا' });
      const byAcc = new Map<string, { d: number; c: number }>();
      for (const r of rows) {
        const c = code(r); if (!c && r.debit == null && r.credit == null) continue;
        if (!checkAccount(r, c)) continue;
        const s = side(r); if (!s || (!s.d && !s.c)) continue;
        const o = byAcc.get(c) ?? { d: 0, c: 0 }; o.d += s.d; o.c += s.c; byAcc.set(c, o);
      }
      const payload = [...byAcc].map(([accountCode, s]) => ({ accountCode, debit: fromCents(Math.max(s.d - s.c, 0)), credit: fromCents(Math.max(s.c - s.d, 0)) }));
      const td = payload.reduce((s, l) => s + toCents(l.debit), 0), tc = payload.reduce((s, l) => s + toCents(l.credit), 0);
      if (td !== tc) issues.push({ row: 0, level: 'warning', message: `الأرصدة غير متوازنة بفارق ${fromCents(td - tc)} — سيُقيَّد الفرق على حساب الأرصدة الافتتاحية 220001` });
      return { issues, payload, summary: { rows: rows.length, accounts: payload.length, totalDebit: fromCents(td), totalCredit: fromCents(tc), difference: fromCents(td - tc) } };
    }

    // transactions: grouped into entries by (ref, date)
    const centers = new Map((await this.prisma.costCenter.findMany()).map((c) => [norm(c.code), c.id]));
    (await this.prisma.costCenter.findMany()).forEach((c) => centers.set(norm(c.name), c.id));
    const groups = new Map<string, { ref: string; date: string; description: string; currency?: string; rate?: number; lines: { accountCode: string; debit: number; credit: number; costCenterId?: number; memo?: string }[]; rows: number[] }>();
    let last: Row | null = null;
    for (const r of rows) {
      const c = code(r);
      const ref = String(r.ref ?? last?.ref ?? '').trim(), dateRaw = r.date ?? last?.date;
      if (r.ref != null || r.date != null) last = r;
      if (!ref) { err(r._row, 'رقم القيد فارغ'); continue; }
      let date: string;
      try { date = dayOf(typeof dateRaw === 'number' ? new Date(Math.round((dateRaw - 25569) * 864e5)) : String(dateRaw)).toISOString().slice(0, 10); } catch { err(r._row, `تاريخ غير صالح "${dateRaw}"`); continue; }
      if (!checkAccount(r, c)) continue;
      const s = side(r); if (!s) continue;
      if (!s.d && !s.c) continue;
      let costCenterId: number | undefined;
      if (r.costCenter) { costCenterId = centers.get(norm(r.costCenter)); if (!costCenterId) issues.push({ row: r._row, level: 'warning', message: `مركز الكلفة "${r.costCenter}" غير معروف — سيُترك فارغًا` }); }
      const key = `${ref}|${date}`;
      const g = groups.get(key) ?? { ref, date, description: String(r.description ?? `قيد مستورد ${ref}`), currency: (r.currency as string) || opt.currency, rate: r.rate ? Number(r.rate) : undefined, lines: [], rows: [] };
      g.lines.push({ accountCode: c, debit: fromCents(s.d), credit: fromCents(s.c), costCenterId, memo: r.description ? String(r.description) : undefined });
      g.rows.push(r._row); groups.set(key, g);
    }
    let td = 0, tc = 0;
    for (const g of groups.values()) {
      const d = g.lines.reduce((s, l) => s + toCents(l.debit), 0), c = g.lines.reduce((s, l) => s + toCents(l.credit), 0);
      td += d; tc += c;
      if (d !== c) err(g.rows[0], `القيد ${g.ref} (${g.date}) غير متوازن: ${fromCents(d)} ≠ ${fromCents(c)}`);
      if (g.lines.length < 2) err(g.rows[0], `القيد ${g.ref} فيه سطر واحد`);
    }
    const closed = await this.prisma.fiscalPeriod.findMany({ where: { status: 'CLOSED' } });
    for (const g of groups.values()) { const d = new Date(g.date); if (closed.find((p) => p.year === d.getUTCFullYear() && p.month === d.getUTCMonth() + 1)) err(g.rows[0], `القيد ${g.ref} يقع في فترة مقفلة`); }
    const payload = [...groups.values()].map(({ rows: _r, ...g }) => g);
    return { issues, payload, summary: { rows: rows.length, entries: payload.length, totalDebit: fromCents(td), totalCredit: fromCents(tc) } };
  }

  /** Step 2 — commit a validated batch. All-or-nothing. */
  @Post(':id/commit') @Require(P.IMPORT_RUN)
  async commit(@CurrentUser() u: AuthUser, @Param('id') id: string, @Meta() m: ReqMeta) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: +id } });
    if (!batch) throw new NotFoundException('الدفعة غير موجودة');
    if (batch.status !== 'VALIDATED') throw new ConflictException('يمكن اعتماد دفعة سليمة لم تُعتمد بعد فقط');
    const { payload, options } = batch.stats as any;
    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      if (batch.kind === 'accounts') {
        const all = new Map((await tx.account.findMany()).map((a) => [a.code, a]));
        for (const p of (payload as { code: string; name: string }[]).sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))) {
          let parent: string | null = null;
          for (let n = p.code.length - 1; n >= 1 && !parent; n--) if (all.has(p.code.slice(0, n))) parent = p.code.slice(0, n);
          const pa = parent ? all.get(parent)! : null;
          if (pa?.isPosting) {
            if (await tx.journalLine.count({ where: { accountCode: pa.code } })) throw new ConflictException(`الحساب ${pa.code} عليه حركات ولا يمكن أن يصبح أبًا لـ ${p.code}`);
            await tx.account.update({ where: { code: pa.code }, data: { isPosting: false } }); pa.isPosting = false;
          }
          const a = await tx.account.create({ data: { code: p.code, name: p.name, parent, level: pa ? pa.level + 1 : 1, kind: pa?.kind ?? 'BS',
            nature: pa?.nature ?? (['2', '4'].includes(p.code[0]) ? 'CREDIT' : 'DEBIT') } });
          all.set(a.code, a); created++;
        }
      } else if (batch.kind === 'balances') {
        await this.ledger.createAndPost(u, { date: options.date, currency: options.currency, description: `الأرصدة الافتتاحية — مرحّلة من نظام الراشد (${batch.fileName})`, lines: buildOpeningLines(payload) }, 'OPENING', m, tx, { importBatch: batch.id });
        created = 1;
      } else {
        for (const g of payload) {
          await this.ledger.createAndPost(u, { date: g.date, currency: g.currency, rate: g.rate, description: g.description, reference: g.ref, lines: g.lines }, 'IMPORT', m, tx, { importBatch: batch.id });
          created++;
        }
      }
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTED' } });
      await this.audit.log(u, 'IMPORT_COMMIT', 'ImportBatch', batch.id, { after: { kind: batch.kind, created } }, m, tx);
      return { created };
    }, { timeout: 10 * 60 * 1000, maxWait: 20000 });
    return { ok: true, ...result };
  }

  /** Reconciliation: per-account totals in the file vs what the ledger holds for this batch. */
  @Get(':id/reconcile') @Require(P.IMPORT_RUN)
  async reconcile(@Param('id') id: string) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: +id } });
    if (!batch) throw new NotFoundException('الدفعة غير موجودة');
    if (batch.kind === 'accounts') {
      const p = (batch.stats as any).payload as { code: string; name: string }[];
      const found = await this.prisma.account.count({ where: { code: { in: p.map((x) => x.code) } } });
      return { kind: 'accounts', expected: p.length, found, ok: found === p.length };
    }
    const fileTotals = new Map<string, number>();
    const add = (code: string, d: number, c: number) => fileTotals.set(code, (fileTotals.get(code) ?? 0) + toCents(d) - toCents(c));
    const payload = (batch.stats as any).payload;
    if (batch.kind === 'balances') buildOpeningLines(payload).forEach((l) => add(l.accountCode, l.debit, l.credit));
    else payload.forEach((g: any) => g.lines.forEach((l: any) => add(l.accountCode, l.debit, l.credit)));
    const g = await this.prisma.journalLine.groupBy({ by: ['accountCode'], where: { entry: { importBatch: batch.id, status: { in: ['POSTED', 'REVERSED'] } } }, _sum: { debit: true, credit: true } });
    const ledger = new Map(g.map((r) => [r.accountCode, toCents(r._sum.debit) - toCents(r._sum.credit)]));
    const codes = [...new Set([...fileTotals.keys(), ...ledger.keys()])].sort();
    const rows = codes.map((code) => ({ code, file: fromCents(fileTotals.get(code) ?? 0), ledger: fromCents(ledger.get(code) ?? 0), diff: fromCents((fileTotals.get(code) ?? 0) - (ledger.get(code) ?? 0)) }));
    const mismatches = rows.filter((r) => r.diff);
    return { kind: batch.kind, status: batch.status, accounts: rows.length, mismatches: mismatches.length, ok: batch.status === 'COMMITTED' && !mismatches.length, rows };
  }
}
