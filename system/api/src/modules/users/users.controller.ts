import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, ReqMeta, Require } from '../../common/context';
import { PERMISSIONS } from '../../common/permissions';
import { passwordProblem } from '../auth/auth.controller';

const SAFE = { id: true, username: true, fullName: true, active: true, totpEnabled: true, lastLoginAt: true, createdAt: true, role: { select: { id: true, code: true, name: true } } };

@Controller('users')
@Require(PERMISSIONS.USERS_MANAGE)
export class UsersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get() list() { return this.prisma.user.findMany({ select: SAFE, orderBy: { id: 'asc' } }); }
  @Get('roles') roles() { return this.prisma.role.findMany({ orderBy: { id: 'asc' } }); }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() b: { username: string; fullName: string; password: string; roleId: number }, @Meta() m: ReqMeta) {
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new BadRequestException('اسم المستخدم: 3–30 حرفًا لاتينيًا أو أرقام');
    if (!String(b.fullName || '').trim()) throw new BadRequestException('الاسم الكامل مطلوب');
    const problem = passwordProblem(b.password);
    if (problem) throw new BadRequestException(problem);
    const user = await this.prisma.user.create({
      data: { username, fullName: b.fullName.trim(), roleId: Number(b.roleId), passwordHash: await bcrypt.hash(b.password, 12) },
      select: SAFE,
    });
    await this.audit.log(u, 'CREATE', 'User', user.id, { after: user }, m);
    return user;
  }

  @Patch(':id')
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() b: { fullName?: string; roleId?: number; active?: boolean; password?: string; reset2fa?: boolean }, @Meta() m: ReqMeta) {
    if (id === u.id && (b.active === false || b.roleId !== undefined)) throw new BadRequestException('لا يمكنك تعطيل حسابك أو تغيير دورك');
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: SAFE });
    const data: Record<string, unknown> = {};
    if (b.fullName !== undefined) data.fullName = String(b.fullName).trim();
    if (b.roleId !== undefined) data.roleId = Number(b.roleId);
    if (b.active !== undefined) data.active = !!b.active;
    if (b.reset2fa) Object.assign(data, { totpEnabled: false, totpSecret: null });
    if (b.password) {
      const problem = passwordProblem(b.password);
      if (problem) throw new BadRequestException(problem);
      data.passwordHash = await bcrypt.hash(b.password, 12);
    }
    const after = await this.prisma.user.update({ where: { id }, data, select: SAFE });
    await this.audit.log(u, 'UPDATE', 'User', id, { before, after: { ...after, passwordChanged: !!b.password } }, m);
    return after;
  }
}
