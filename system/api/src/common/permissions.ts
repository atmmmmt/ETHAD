/** Every permission the system knows. Roles hold a subset; ADMIN holds '*'. */
export const PERMISSIONS = {
  ACCOUNTS_VIEW: 'accounts.view',
  ACCOUNTS_MANAGE: 'accounts.manage',
  JOURNAL_VIEW: 'journal.view',
  JOURNAL_CREATE: 'journal.create',
  JOURNAL_APPROVE: 'journal.approve',
  JOURNAL_REVERSE: 'journal.reverse',
  PERIODS_CLOSE: 'periods.close',
  REPORTS_VIEW: 'reports.view',
  BUDGETS_VIEW: 'budgets.view',
  BUDGETS_MANAGE: 'budgets.manage',
  INVESTORS_VIEW: 'investors.view',
  INVESTORS_MANAGE: 'investors.manage',
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_MANAGE: 'payroll.manage',
  PAYROLL_POST: 'payroll.post',
  IMPORT_RUN: 'import.run',
  USERS_MANAGE: 'users.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;
const VIEW_ALL = [P.ACCOUNTS_VIEW, P.JOURNAL_VIEW, P.REPORTS_VIEW, P.BUDGETS_VIEW, P.INVESTORS_VIEW, P.PAYROLL_VIEW];

export const DEFAULT_ROLES: { code: string; name: string; permissions: string[] }[] = [
  { code: 'ADMIN', name: 'مدير النظام', permissions: ['*'] },
  { code: 'CHAIRMAN', name: 'رئيس مجلس الإدارة', permissions: [...VIEW_ALL, P.JOURNAL_APPROVE, P.AUDIT_VIEW] },
  { code: 'FIN_MANAGER', name: 'المدير المالي', permissions: [...VIEW_ALL, P.ACCOUNTS_MANAGE, P.JOURNAL_CREATE, P.JOURNAL_APPROVE, P.JOURNAL_REVERSE, P.PERIODS_CLOSE, P.BUDGETS_MANAGE, P.INVESTORS_MANAGE, P.PAYROLL_POST, P.IMPORT_RUN, P.AUDIT_VIEW] },
  { code: 'ACCOUNTANT', name: 'محاسب', permissions: [P.ACCOUNTS_VIEW, P.JOURNAL_VIEW, P.JOURNAL_CREATE, P.REPORTS_VIEW, P.INVESTORS_VIEW, P.BUDGETS_VIEW] },
  { code: 'CASHIER', name: 'أمين الصندوق', permissions: [P.ACCOUNTS_VIEW, P.JOURNAL_VIEW, P.JOURNAL_CREATE] },
  { code: 'HR', name: 'شؤون الموظفين', permissions: [P.PAYROLL_VIEW, P.PAYROLL_MANAGE] },
  { code: 'AUDITOR', name: 'مدقق', permissions: [...VIEW_ALL, P.AUDIT_VIEW] },
];

export function can(perms: string[], p: string) {
  return perms.includes('*') || perms.includes(p);
}
