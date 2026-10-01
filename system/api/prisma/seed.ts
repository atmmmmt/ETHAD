/* Seeds roles, the first admin, currencies, the club's real chart of accounts,
   cost centres by sport/department and the 2026 fiscal periods. Idempotent. */
import { PrismaClient, AccountKind, Nature, CostCenterType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_ROLES } from '../src/common/permissions';

const prisma = new PrismaClient();

async function main() {
  for (const r of DEFAULT_ROLES)
    await prisma.role.upsert({ where: { code: r.code }, update: { name: r.name, permissions: r.permissions }, create: r });

  const admin = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const pw = process.env.ADMIN_PASSWORD || 'Admin@2026change';
  await prisma.user.upsert({ where: { username: 'admin' }, update: {},
    create: { username: 'admin', fullName: 'مدير النظام', passwordHash: await bcrypt.hash(pw, 12), roleId: admin.id } });

  for (const c of [
    { code: 'USD', name: 'دولار أمريكي', symbol: '$', isBase: true },
    { code: 'SYP', name: 'ليرة سورية', symbol: 'ل.س', isBase: false },
    { code: 'TRY', name: 'ليرة تركية', symbol: '₺', isBase: false },
  ]) await prisma.currency.upsert({ where: { code: c.code }, update: {}, create: c });

  // chart of accounts: parent = longest existing code that prefixes this one
  const raw: [string, string, string][] = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/accounts.json'), 'utf8'));
  const codes = new Set(raw.map((r) => r[0]));
  const parentOf = (c: string) => { for (let n = c.length - 1; n >= 1; n--) if (codes.has(c.slice(0, n))) return c.slice(0, n); return null; };
  const levelOf = (c: string): number => { const p = parentOf(c); return p ? levelOf(p) + 1 : 1; };
  const hasChild = new Set(raw.map((r) => parentOf(r[0])).filter(Boolean) as string[]);
  const kindMap: Record<string, AccountKind> = { bs: 'BS', pl: 'PL', tr: 'TR' };
  const data = raw.map(([code, name, k]) => ({
    code, name, parent: parentOf(code), level: levelOf(code), kind: kindMap[k] ?? 'BS',
    nature: (['2', '4'].includes(code[0]) ? 'CREDIT' : 'DEBIT') as Nature, isPosting: !hasChild.has(code),
  }));
  await prisma.account.createMany({ data, skipDuplicates: true });

  const centers: [string, string, CostCenterType][] = [
    ['SP-FB', 'كرة القدم', 'SPORT'], ['SP-BB', 'كرة السلة', 'SPORT'], ['SP-HB', 'كرة اليد', 'SPORT'],
    ['SP-VB', 'الكرة الطائرة', 'SPORT'], ['SP-OT', 'ألعاب أخرى', 'SPORT'],
    ['DP-ADM', 'الإدارة العامة', 'DEPARTMENT'], ['DP-FIN', 'المالية', 'DEPARTMENT'], ['DP-FAC', 'المنشآت والصيانة', 'DEPARTMENT'],
    ['DP-MED', 'الإعلام والتسويق', 'DEPARTMENT'],
  ];
  for (const [code, name, type] of centers) await prisma.costCenter.upsert({ where: { code }, update: {}, create: { code, name, type } });

  for (let m = 1; m <= 12; m++) await prisma.fiscalPeriod.upsert({ where: { year_month: { year: 2026, month: m } }, update: {}, create: { year: 2026, month: m } });

  console.log(`seeded: ${data.length} accounts, ${centers.length} cost centres`);
}
main().finally(() => prisma.$disconnect());
