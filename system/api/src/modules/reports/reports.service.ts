import { Injectable } from '@nestjs/common';
import { Account, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { fromCents, toCents } from '../../common/money';
import { dayOf } from '../ledger/ledger.service';

const POSTED: Prisma.JournalEntryWhereInput = { status: { in: ['POSTED', 'REVERSED'] } };
type Sums = Map<string, { d: number; c: number }>; // cents, base currency

/** All figures are in base currency and come only from posted entries. */
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private accountsCache?: { at: number; list: Account[] };
  async accounts() {
    if (!this.accountsCache || Date.now() - this.accountsCache.at > 30000)
      this.accountsCache = { at: Date.now(), list: await this.prisma.account.findMany({ orderBy: { code: 'asc' } }) };
    return this.accountsCache.list;
  }

  async sums(where: Prisma.JournalLineWhereInput = {}, entry: Prisma.JournalEntryWhereInput = {}): Promise<Sums> {
    const g = await this.prisma.journalLine.groupBy({ by: ['accountCode'], where: { ...where, entry: { ...POSTED, ...entry } }, _sum: { debitBase: true, creditBase: true } });
    return new Map(g.map((r) => [r.accountCode, { d: toCents(r._sum.debitBase), c: toCents(r._sum.creditBase) }]));
  }

  /** Adds each posting account's sums to itself and every ancestor. */
  private rollup(accts: Account[], sums: Sums) {
    const by = new Map(accts.map((a) => [a.code, a]));
    const out: Sums = new Map();
    for (const [code, s] of sums) {
      let cur: string | null = code;
      while (cur) {
        const o = out.get(cur) ?? { d: 0, c: 0 };
        o.d += s.d; o.c += s.c; out.set(cur, o);
        cur = by.get(cur)?.parent ?? null;
      }
    }
    return out;
  }

  async trialBalance(q: { from?: string; to?: string; level?: number; zero?: boolean }) {
    const accts = await this.accounts();
    const to = q.to ? dayOf(q.to) : undefined, from = q.from ? dayOf(q.from) : undefined;
    const open = from ? this.rollup(accts, await this.sums({}, { date: { lt: from } })) : new Map();
    const mov = this.rollup(accts, await this.sums({}, { date: { gte: from, lte: to } }));
    const level = q.level || 99;
    const rows = accts
      .filter((a) => a.level === level || (a.level < level && a.isPosting))
      .map((a) => {
        const o = open.get(a.code) ?? { d: 0, c: 0 }, m = mov.get(a.code) ?? { d: 0, c: 0 };
        const ob = o.d - o.c, cb = ob + m.d - m.c;
        return { code: a.code, name: a.name, level: a.level, kind: a.kind,
          openDebit: fromCents(Math.max(ob, 0)), openCredit: fromCents(Math.max(-ob, 0)),
          debit: fromCents(m.d), credit: fromCents(m.c),
          closeDebit: fromCents(Math.max(cb, 0)), closeCredit: fromCents(Math.max(-cb, 0)) };
      })
      .filter((r) => q.zero || r.openDebit || r.openCredit || r.debit || r.credit);
    const t = (k: keyof (typeof rows)[number]) => fromCents(rows.reduce((s, r) => s + toCents(r[k] as number), 0));
    const totals = { openDebit: t('openDebit'), openCredit: t('openCredit'), debit: t('debit'), credit: t('credit'), closeDebit: t('closeDebit'), closeCredit: t('closeCredit') };
    return { rows, totals, balanced: totals.debit === totals.credit && totals.closeDebit === totals.closeCredit };
  }

  /** Revenues (4x) and expenses (3x, excluding balance-sheet 31) for a date range, grouped at `level`. */
  async incomeStatement(q: { from?: string; to?: string; level?: number; costCenterId?: number }) {
    const accts = await this.accounts();
    const sums = this.rollup(accts, await this.sums(q.costCenterId ? { costCenterId: q.costCenterId } : {},
      { date: { gte: q.from ? dayOf(q.from) : undefined, lte: q.to ? dayOf(q.to) : undefined } }));
    const level = q.level || 2;
    const pick = (digit: string, sign: 1 | -1) => accts
      .filter((a) => a.code[0] === digit && a.kind !== 'BS' && (a.level === level || (a.level < level && a.isPosting)))
      .map((a) => { const s = sums.get(a.code) ?? { d: 0, c: 0 }; return { code: a.code, name: a.name, amount: fromCents(sign * (s.c - s.d)) }; })
      .filter((r) => r.amount);
    const revenues = pick('4', 1), expenses = pick('3', -1);
    const totalRevenue = fromCents(revenues.reduce((s, r) => s + toCents(r.amount), 0));
    const totalExpense = fromCents(expenses.reduce((s, r) => s + toCents(r.amount), 0));
    return { revenues, expenses, totalRevenue, totalExpense, net: fromCents(toCents(totalRevenue) - toCents(totalExpense)) };
  }

  async balanceSheet(q: { to?: string; level?: number }) {
    const accts = await this.accounts();
    const sums = this.rollup(accts, await this.sums({}, { date: { lte: q.to ? dayOf(q.to) : undefined } }));
    const level = q.level || 2;
    const bal = (code: string) => { const s = sums.get(code) ?? { d: 0, c: 0 }; return s.d - s.c; };
    const rows = (digit: string, sign: 1 | -1) => accts
      .filter((a) => a.kind === 'BS' && a.code[0] === digit && (a.level === level || (a.level < level && a.isPosting)))
      .map((a) => ({ code: a.code, name: a.name, amount: fromCents(sign * bal(a.code)) })).filter((r) => r.amount);
    const assets = rows('1', 1), liabilities = [...rows('2', -1), ...rows('3', -1)];
    // result of the period = everything not on the balance sheet
    const result = -accts.filter((a) => a.kind !== 'BS' && !a.parent).reduce((s, a) => s + bal(a.code), 0);
    const tA = assets.reduce((s, r) => s + toCents(r.amount), 0), tL = liabilities.reduce((s, r) => s + toCents(r.amount), 0);
    return { assets, liabilities, result: fromCents(result), totalAssets: fromCents(tA), totalLiabilities: fromCents(tL + result), balanced: tA === tL + result };
  }

  /** Account statement with running balance (account code is a prefix: a group shows all its children). */
  async ledger(q: { account: string; from?: string; to?: string; costCenterId?: number }) {
    const from = q.from ? dayOf(q.from) : undefined, to = q.to ? dayOf(q.to) : undefined;
    const lineWhere: Prisma.JournalLineWhereInput = { accountCode: { startsWith: q.account }, ...(q.costCenterId ? { costCenterId: q.costCenterId } : {}) };
    const ob = from ? await this.prisma.journalLine.aggregate({ where: { ...lineWhere, entry: { ...POSTED, date: { lt: from } } }, _sum: { debitBase: true, creditBase: true } }) : null;
    let bal = ob ? toCents(ob._sum.debitBase) - toCents(ob._sum.creditBase) : 0;
    const opening = fromCents(bal);
    const lines = await this.prisma.journalLine.findMany({
      where: { ...lineWhere, entry: { ...POSTED, date: { gte: from, lte: to } } },
      include: { entry: { select: { id: true, number: true, date: true, description: true, reference: true, currency: true, source: true } }, account: { select: { name: true } }, costCenter: { select: { name: true } } },
      orderBy: [{ entry: { date: 'asc' } }, { entry: { number: 'asc' } }, { lineNo: 'asc' }],
    });
    let td = 0, tc = 0;
    const rows = lines.map((l) => {
      const d = toCents(l.debitBase), c = toCents(l.creditBase);
      bal += d - c; td += d; tc += c;
      return { entryId: l.entry.id, number: l.entry.number, date: l.entry.date, description: l.memo || l.entry.description, reference: l.entry.reference,
        account: l.accountCode, accountName: l.account.name, costCenter: l.costCenter?.name, currency: l.entry.currency,
        debitFx: Number(l.debit), creditFx: Number(l.credit), debit: fromCents(d), credit: fromCents(c), balance: fromCents(bal) };
    });
    return { opening, rows, totalDebit: fromCents(td), totalCredit: fromCents(tc), closing: fromCents(bal) };
  }

  /** Revenue/expense by cost centre for a range. */
  async costCenters(q: { from?: string; to?: string }) {
    const g = await this.prisma.journalLine.groupBy({
      by: ['costCenterId', 'accountCode'], where: { costCenterId: { not: null }, entry: { ...POSTED, date: { gte: q.from ? dayOf(q.from) : undefined, lte: q.to ? dayOf(q.to) : undefined } } },
      _sum: { debitBase: true, creditBase: true },
    });
    const centers = await this.prisma.costCenter.findMany({ orderBy: { code: 'asc' } });
    return centers.map((c) => {
      let rev = 0, exp = 0;
      g.filter((r) => r.costCenterId === c.id).forEach((r) => {
        const net = toCents(r._sum.debitBase) - toCents(r._sum.creditBase);
        if (r.accountCode[0] === '4') rev -= net; else if (r.accountCode[0] === '3') exp += net;
      });
      return { id: c.id, code: c.code, name: c.name, type: c.type, revenue: fromCents(rev), expense: fromCents(exp), net: fromCents(rev - exp) };
    });
  }

  /** Cash & bank balances (group 18) as of a date. */
  async cash(to?: string) {
    const accts = (await this.accounts()).filter((a) => a.code.startsWith('18') && a.isPosting);
    const sums = await this.sums({ accountCode: { startsWith: '18' } }, { date: { lte: to ? dayOf(to) : undefined } });
    return accts.map((a) => { const s = sums.get(a.code) ?? { d: 0, c: 0 }; return { code: a.code, name: a.name, balance: fromCents(s.d - s.c) }; })
      .filter((r) => r.balance);
  }

  /** Monthly revenue / expense series for a year. */
  async monthly(year: number, costCenterId?: number) {
    const rows = await this.prisma.$queryRaw<{ m: number; rev: Prisma.Decimal; exp: Prisma.Decimal }[]>`
      SELECT EXTRACT(MONTH FROM e.date)::int AS m,
        COALESCE(SUM(CASE WHEN l."accountCode" LIKE '4%' THEN l."creditBase" - l."debitBase" END),0) AS rev,
        COALESCE(SUM(CASE WHEN l."accountCode" LIKE '3%' AND l."accountCode" NOT LIKE '31%' THEN l."debitBase" - l."creditBase" END),0) AS exp
      FROM "JournalLine" l JOIN "JournalEntry" e ON e.id = l."entryId"
      WHERE e.status IN ('POSTED','REVERSED') AND EXTRACT(YEAR FROM e.date) = ${year}
        AND (${costCenterId ?? null}::int IS NULL OR l."costCenterId" = ${costCenterId ?? null}::int)
      GROUP BY 1 ORDER BY 1`;
    return Array.from({ length: 12 }, (_, i) => {
      const r = rows.find((x) => x.m === i + 1);
      return { month: i + 1, revenue: Number(r?.rev ?? 0), expense: Number(r?.exp ?? 0) };
    });
  }
}
