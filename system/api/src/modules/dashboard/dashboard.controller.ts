import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser, CurrentUser, Require } from '../../common/context';
import { can, PERMISSIONS as P } from '../../common/permissions';
import { fromCents, toCents } from '../../common/money';
import { dayOf, LedgerService } from '../ledger/ledger.service';
import { ReportsService } from '../reports/reports.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private prisma: PrismaService, private reports: ReportsService, private ledger: LedgerService) {}

  @Get() @Require(P.REPORTS_VIEW)
  async get(@CurrentUser() u: AuthUser, @Query('year') y?: string) {
    const now = new Date(), year = +(y || now.getUTCFullYear());
    const [monthly, cash, centers, pending, overdue, base] = await Promise.all([
      this.reports.monthly(year),
      this.reports.cash(),
      this.reports.costCenters({ from: `${year}-01-01`, to: `${year}-12-31` }),
      can(u.permissions, P.JOURNAL_APPROVE) ? this.prisma.journalEntry.count({ where: { status: 'SUBMITTED' } }) : Promise.resolve(0),
      can(u.permissions, P.INVESTORS_VIEW) ? this.prisma.installment.findMany({ where: { paidAt: null, dueDate: { lt: dayOf(now) } }, include: { investor: { select: { name: true, currency: true } } }, orderBy: { dueDate: 'asc' }, take: 10 }) : Promise.resolve([]),
      this.ledger.baseCurrency(),
    ]);
    const ytd = monthly.reduce((s, m) => ({ revenue: s.revenue + toCents(m.revenue), expense: s.expense + toCents(m.expense) }), { revenue: 0, expense: 0 });
    const cur = monthly[now.getUTCMonth()];
    return {
      year, baseCurrency: base,
      kpis: { cash: fromCents(cash.reduce((s, c) => s + toCents(c.balance), 0)), revenueYtd: fromCents(ytd.revenue), expenseYtd: fromCents(ytd.expense),
        netYtd: fromCents(ytd.revenue - ytd.expense), monthRevenue: cur?.revenue ?? 0, monthExpense: cur?.expense ?? 0, pendingApprovals: pending },
      monthly, cash, centers: centers.filter((c) => c.revenue || c.expense),
      overdue: overdue.map((o) => ({ id: o.id, investor: o.investor.name, dueDate: o.dueDate, amount: Number(o.amount), currency: o.investor.currency })),
      recent: await this.prisma.journalEntry.findMany({ where: { status: 'POSTED' }, orderBy: { postedAt: 'desc' }, take: 8, select: { id: true, number: true, date: true, description: true, total: true, currency: true, source: true } }),
    };
  }
}
