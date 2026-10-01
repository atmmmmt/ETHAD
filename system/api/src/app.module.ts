import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './common/prisma.service';
import { AuditService } from './common/audit.service';
import { AuthGuard } from './common/auth.guard';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AuthController } from './modules/auth/auth.controller';
import { UsersController } from './modules/users/users.controller';
import { AuditController } from './modules/audit/audit.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { LedgerService } from './modules/ledger/ledger.service';
import { AccountsController, CostCentersController, CurrenciesController, PeriodsController } from './modules/accounts/accounts.controller';
import { JournalController, OpeningController, VouchersController } from './modules/journal/journal.controller';
import { ReportsService } from './modules/reports/reports.service';
import { ReportsController } from './modules/reports/reports.controller';
import { BudgetsController } from './modules/budgets/budgets.controller';
import { InvestorsController } from './modules/investors/investors.controller';
import { EmployeesController, PayrollController } from './modules/payroll/payroll.controller';
import { ImportsController } from './modules/imports/imports.controller';
import { DashboardController } from './modules/dashboard/dashboard.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || (process.env.NODE_ENV === 'production' && secret.length < 32)) throw new Error('JWT_SECRET missing or too short');
        return { secret, signOptions: { expiresIn: '8h' } };
      },
    }),
  ],
  controllers: [
    AuthController, UsersController, AuditController, SettingsController,
    AccountsController, CostCentersController, CurrenciesController, PeriodsController,
    JournalController, VouchersController, OpeningController, ReportsController,
    BudgetsController, InvestorsController, EmployeesController, PayrollController, ImportsController, DashboardController,
  ],
  providers: [
    PrismaService,
    AuditService,
    LedgerService,
    ReportsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
