import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { sendXlsx } from '../../common/xlsx';
import { ReportsService } from './reports.service';

const num = (v?: string) => (v ? Number(v) : undefined);

@Controller('reports')
export class ReportsController {
  constructor(private r: ReportsService) {}

  @Get('trial-balance') @Require(P.REPORTS_VIEW)
  async tb(@Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const d = await this.r.trialBalance({ from: q.from, to: q.to, level: num(q.level), zero: q.zero === '1' });
    if (q.format !== 'xlsx') return d;
    await sendXlsx(res, 'ميزان-المراجعة', 'ميزان المراجعة', [
      { key: 'code', header: 'الرمز', width: 12 }, { key: 'name', header: 'الحساب', width: 40 },
      { key: 'openDebit', header: 'افتتاحي مدين', money: true }, { key: 'openCredit', header: 'افتتاحي دائن', money: true },
      { key: 'debit', header: 'حركة مدين', money: true }, { key: 'credit', header: 'حركة دائن', money: true },
      { key: 'closeDebit', header: 'رصيد مدين', money: true }, { key: 'closeCredit', header: 'رصيد دائن', money: true },
    ], d.rows, { name: 'المجموع', ...d.totals });
  }

  @Get('income-statement') @Require(P.REPORTS_VIEW)
  async is(@Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const d = await this.r.incomeStatement({ from: q.from, to: q.to, level: num(q.level), costCenterId: num(q.costCenterId) });
    if (q.format !== 'xlsx') return d;
    const rows = [{ name: 'الإيرادات' }, ...d.revenues, { name: 'مجموع الإيرادات', amount: d.totalRevenue }, { name: 'النفقات' }, ...d.expenses,
      { name: 'مجموع النفقات', amount: d.totalExpense }];
    await sendXlsx(res, 'قائمة-الدخل', 'قائمة الدخل', [{ key: 'code', header: 'الرمز', width: 12 }, { key: 'name', header: 'البند', width: 44 }, { key: 'amount', header: 'المبلغ', money: true }],
      rows, { name: d.net >= 0 ? 'الفائض' : 'العجز', amount: d.net });
  }

  @Get('balance-sheet') @Require(P.REPORTS_VIEW)
  async bs(@Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const d = await this.r.balanceSheet({ to: q.to, level: num(q.level) });
    if (q.format !== 'xlsx') return d;
    const rows = [{ name: 'الأصول' }, ...d.assets, { name: 'مجموع الأصول', amount: d.totalAssets }, { name: 'الخصوم وحقوق النادي' }, ...d.liabilities,
      { name: 'نتيجة الفترة', amount: d.result }];
    await sendXlsx(res, 'الميزانية', 'الميزانية العمومية', [{ key: 'code', header: 'الرمز', width: 12 }, { key: 'name', header: 'البند', width: 44 }, { key: 'amount', header: 'المبلغ', money: true }],
      rows, { name: 'مجموع الخصوم وحقوق النادي', amount: d.totalLiabilities });
  }

  @Get('ledger') @Require(P.REPORTS_VIEW)
  async ledger(@Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const d = await this.r.ledger({ account: q.account || '', from: q.from, to: q.to, costCenterId: num(q.costCenterId) });
    if (q.format !== 'xlsx') return d;
    await sendXlsx(res, `كشف-حساب-${q.account}`, `كشف حساب ${q.account}`, [
      { key: 'date', header: 'التاريخ', width: 12 }, { key: 'number', header: 'رقم القيد', width: 10 }, { key: 'account', header: 'الحساب', width: 12 },
      { key: 'description', header: 'البيان', width: 44 }, { key: 'debit', header: 'مدين', money: true }, { key: 'credit', header: 'دائن', money: true }, { key: 'balance', header: 'الرصيد', money: true },
    ], [{ description: 'رصيد أول المدة', balance: d.opening }, ...d.rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }))],
    { description: 'المجموع', debit: d.totalDebit, credit: d.totalCredit, balance: d.closing });
  }

  @Get('cost-centers') @Require(P.REPORTS_VIEW)
  async cc(@Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const d = await this.r.costCenters(q);
    if (q.format !== 'xlsx') return d;
    await sendXlsx(res, 'مراكز-الكلفة', 'مراكز الكلفة', [{ key: 'code', header: 'الرمز' }, { key: 'name', header: 'المركز', width: 30 },
      { key: 'revenue', header: 'الإيرادات', money: true }, { key: 'expense', header: 'النفقات', money: true }, { key: 'net', header: 'الصافي', money: true }], d);
  }

  @Get('cash') @Require(P.REPORTS_VIEW)
  cash(@Query('to') to?: string) { return this.r.cash(to); }

  @Get('monthly') @Require(P.REPORTS_VIEW)
  monthly(@Query('year') year: string, @Query('costCenterId') cc?: string) { return this.r.monthly(+year || new Date().getFullYear(), num(cc)); }
}
