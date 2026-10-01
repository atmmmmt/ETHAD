import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Put } from '@nestjs/common';
import { Employee, PayrollLine } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS as P } from '../../common/permissions';
import { dec, fromCents, toCents } from '../../common/money';
import { dayOf, LedgerService } from '../ledger/ledger.service';
import { getSettings, Settings } from '../settings/settings.controller';

type EmpInput = { code: string; fullName: string; department: string; position: string; baseSalary: number; allowance?: number; currency: string; hireDate?: string; phone?: string; active?: boolean };

/** Payslip arithmetic, in cents. Lateness beyond the grace period and absence are deducted pro-rata. */
export function payslip(e: Pick<Employee, 'baseSalary' | 'allowance'>, l: Pick<PayrollLine, 'bonus' | 'overtime' | 'lateMin' | 'absentDays' | 'advance' | 'penalty'>, s: Settings['payroll']) {
  const fixed = toCents(e.baseSalary) + toCents(e.allowance);
  const daily = fixed / s.workDays, hourly = daily / s.workHours;
  const late = Math.round((Math.max(0, l.lateMin - s.graceMinutes) / 60) * hourly);
  const absence = Math.round(Number(l.absentDays) * daily);
  const bonus = toCents(l.bonus), overtime = toCents(l.overtime), advance = toCents(l.advance), penalty = toCents(l.penalty);
  const salaryCost = Math.max(0, fixed + overtime - late - absence - penalty); // charged to salary expense
  const net = salaryCost + bonus - advance;
  return { fixed, late, absence, bonus, overtime, advance, penalty, salaryCost, gross: fixed + bonus + overtime, deductions: late + absence + advance + penalty, net };
}
const money = (p: ReturnType<typeof payslip>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, fromCents(v)]));

@Controller('employees')
export class EmployeesController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() @Require(P.PAYROLL_VIEW)
  list() { return this.prisma.employee.findMany({ orderBy: [{ department: 'asc' }, { fullName: 'asc' }] }); }

  @Post() @Require(P.PAYROLL_MANAGE)
  async create(@CurrentUser() u: AuthUser, @Body() b: EmpInput, @Meta() m: ReqMeta) {
    if (!b.code || !b.fullName?.trim() || !b.department || !b.currency || !(Number(b.baseSalary) >= 0)) throw new BadRequestException('بيانات الموظف غير مكتملة');
    const e = await this.prisma.employee.create({ data: { ...b, baseSalary: dec(b.baseSalary), allowance: dec(b.allowance || 0), hireDate: b.hireDate ? dayOf(b.hireDate) : null } });
    await this.audit.log(u, 'CREATE', 'Employee', e.id, { after: e }, m);
    return e;
  }

  @Patch(':id') @Require(P.PAYROLL_MANAGE)
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: Partial<EmpInput>, @Meta() m: ReqMeta) {
    const before = await this.prisma.employee.findUnique({ where: { id: +id } });
    if (!before) throw new NotFoundException('الموظف غير موجود');
    const e = await this.prisma.employee.update({ where: { id: +id }, data: { ...b,
      baseSalary: b.baseSalary != null ? dec(b.baseSalary) : undefined, allowance: b.allowance != null ? dec(b.allowance) : undefined,
      hireDate: b.hireDate ? dayOf(b.hireDate) : undefined } });
    await this.audit.log(u, 'UPDATE', 'Employee', id, { before, after: e }, m);
    return e;
  }
}

@Controller('payroll')
export class PayrollController {
  constructor(private prisma: PrismaService, private ledger: LedgerService, private audit: AuditService) {}

  @Get() @Require(P.PAYROLL_VIEW)
  runs() { return this.prisma.payrollRun.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] }); }

  @Get(':id') @Require(P.PAYROLL_VIEW)
  async run(@Param('id') id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: +id }, include: { lines: { include: { employee: true } } } });
    if (!run) throw new NotFoundException('المسير غير موجود');
    const { payroll } = await getSettings(this.prisma);
    const lines = run.lines.sort((a, b) => a.employee.department.localeCompare(b.employee.department, 'ar') || a.employee.fullName.localeCompare(b.employee.fullName, 'ar'))
      .map((l) => ({ ...l, calc: money(payslip(l.employee, l, payroll)) }));
    const byCur: Record<string, number> = {};
    run.lines.forEach((l) => (byCur[l.employee.currency] = (byCur[l.employee.currency] ?? 0) + payslip(l.employee, l, payroll).net));
    return { ...run, lines, totals: Object.fromEntries(Object.entries(byCur).map(([k, v]) => [k, fromCents(v)])) };
  }

  /** Opens the month's run with one line per active employee. */
  @Post() @Require(P.PAYROLL_MANAGE)
  async open(@CurrentUser() u: AuthUser, @Body() b: { year: number; month: number }, @Meta() m: ReqMeta) {
    if (!(b.month >= 1 && b.month <= 12) || !(b.year >= 2020)) throw new BadRequestException('الشهر أو السنة غير صالحة');
    const emps = await this.prisma.employee.findMany({ where: { active: true } });
    if (!emps.length) throw new BadRequestException('لا يوجد موظفون فعّالون');
    const run = await this.prisma.payrollRun.create({ data: { year: +b.year, month: +b.month, lines: { create: emps.map((e) => ({ employeeId: e.id })) } } });
    await this.audit.log(u, 'CREATE', 'PayrollRun', run.id, { after: { year: b.year, month: b.month, employees: emps.length } }, m);
    return this.run(String(run.id));
  }

  @Put(':id/lines/:lid') @Require(P.PAYROLL_MANAGE)
  async line(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('lid') lid: string, @Body() b: Partial<Record<'bonus' | 'overtime' | 'lateMin' | 'absentDays' | 'advance' | 'penalty', number>>, @Meta() m: ReqMeta) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: +id } });
    if (!run) throw new NotFoundException('المسير غير موجود');
    if (run.status === 'POSTED') throw new ConflictException('المسير مرحّل ولا يمكن تعديله');
    for (const [k, v] of Object.entries(b)) if (v != null && !(Number(v) >= 0)) throw new BadRequestException(`قيمة ${k} غير صالحة`);
    const before = await this.prisma.payrollLine.findFirst({ where: { id: +lid, runId: run.id } });
    if (!before) throw new NotFoundException('السطر غير موجود');
    const l = await this.prisma.payrollLine.update({ where: { id: before.id }, data: {
      bonus: b.bonus != null ? dec(b.bonus) : undefined, overtime: b.overtime != null ? dec(b.overtime) : undefined,
      lateMin: b.lateMin != null ? Math.round(b.lateMin) : undefined, absentDays: b.absentDays != null ? dec(b.absentDays) : undefined,
      advance: b.advance != null ? dec(b.advance) : undefined, penalty: b.penalty != null ? dec(b.penalty) : undefined } });
    await this.audit.log(u, 'UPDATE', 'PayrollLine', l.id, { before, after: l }, m);
    return l;
  }

  /** Posts the run: one entry per currency, salary expense split by department cost centre. */
  @Post(':id/post') @Require(P.PAYROLL_POST)
  async post(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() b: { date?: string }, @Meta() m: ReqMeta) {
    const { payroll: s } = await getSettings(this.prisma);
    const centers = await this.prisma.costCenter.findMany({ where: { active: true } });
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id: +id }, include: { lines: { include: { employee: true } } } });
      if (!run) throw new NotFoundException('المسير غير موجود');
      if (run.status === 'POSTED') throw new ConflictException('المسير مرحّل مسبقًا');
      const date = b.date || new Date(Date.UTC(run.year, run.month, 0)).toISOString().slice(0, 10);
      const groups = new Map<string, typeof run.lines>();
      run.lines.forEach((l) => groups.set(l.employee.currency, [...(groups.get(l.employee.currency) ?? []), l]));
      const entryIds: number[] = [];
      for (const [currency, lines] of groups) {
        const salary = new Map<number | null, number>(), bonus = new Map<number | null, number>();
        let advance = 0, net = 0;
        for (const l of lines) {
          const p = payslip(l.employee, l, s);
          const cc = centers.find((c) => c.name === l.employee.department)?.id ?? null;
          salary.set(cc, (salary.get(cc) ?? 0) + p.salaryCost);
          bonus.set(cc, (bonus.get(cc) ?? 0) + p.bonus);
          advance += p.advance; net += p.net;
        }
        if (net < 0) throw new ConflictException(`صافي الرواتب بعملة ${currency} سالب — راجع السلف`);
        const ln = [
          ...[...salary].filter(([, v]) => v).map(([cc, v]) => ({ accountCode: s.salaryAccount, costCenterId: cc, debit: fromCents(v), memo: 'رواتب وأجور' })),
          ...[...bonus].filter(([, v]) => v).map(([cc, v]) => ({ accountCode: s.bonusAccount, costCenterId: cc, debit: fromCents(v), memo: 'مكافآت' })),
          ...(advance ? [{ accountCode: s.advanceAccount, credit: fromCents(advance), memo: 'استرداد سلف' }] : []),
          ...(net ? [{ accountCode: s.payAccount, credit: fromCents(net), memo: 'صافي الرواتب المدفوعة' }] : []),
        ];
        const e = await this.ledger.createAndPost(u, { date, currency, description: `رواتب شهر ${run.month}/${run.year} (${currency})`, reference: `PR-${run.year}-${run.month}`, lines: ln }, 'PAYROLL', m, tx);
        entryIds.push(e.id);
      }
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'POSTED', postedAt: new Date(), entryId: entryIds[0] } });
      await this.audit.log(u, 'POST', 'PayrollRun', run.id, { after: { entryIds } }, m, tx);
      return { ok: true, entryIds };
    }, { timeout: 60000 });
  }
}
