import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS } from '../../common/permissions';

export const DEFAULT_SETTINGS = {
  clubName: 'نادي الأهلي · الاتحاد الحلبي',
  baseCurrency: 'USD',
  approvalThreshold: 1000, // entries above this (base currency) need a second approver
  payroll: { graceMinutes: 15, workDays: 26, workHours: 8, salaryAccount: '338002', bonusAccount: '338005', advanceAccount: '163999', payAccount: '182007' },
  budgetAlerts: [70, 85, 100],
  sessionHours: 8,
};
export type Settings = typeof DEFAULT_SETTINGS;

export async function getSettings(prisma: PrismaService): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const s: any = structuredClone(DEFAULT_SETTINGS);
  rows.forEach((r) => (s[r.key] = typeof s[r.key] === 'object' && !Array.isArray(s[r.key]) ? { ...s[r.key], ...(r.value as object) } : r.value));
  return s;
}

@Controller('settings')
export class SettingsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() get() { return getSettings(this.prisma); }

  @Put()
  @Require(PERMISSIONS.SETTINGS_MANAGE)
  async put(@CurrentUser() u: AuthUser, @Body() b: Partial<Settings>, @Meta() m: ReqMeta) {
    const before = await getSettings(this.prisma);
    if (b.baseCurrency && b.baseCurrency !== before.baseCurrency) {
      const posted = await this.prisma.journalEntry.count({ where: { status: { in: ['POSTED', 'REVERSED'] } } });
      if (posted) throw new BadRequestException('لا يمكن تغيير العملة الأساسية بعد ترحيل قيود');
      await this.prisma.currency.updateMany({ data: { isBase: false } });
      await this.prisma.currency.update({ where: { code: b.baseCurrency }, data: { isBase: true } });
    }
    for (const [key, value] of Object.entries(b)) {
      if (!(key in DEFAULT_SETTINGS)) continue;
      await this.prisma.setting.upsert({ where: { key }, create: { key, value: value as any }, update: { value: value as any } });
    }
    const after = await getSettings(this.prisma);
    await this.audit.log(u, 'UPDATE', 'Settings', null, { before, after }, m);
    return after;
  }
}
