import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { PERM_KEY, PUBLIC_KEY } from './context';
import { can } from './permissions';

/** Global guard: every route needs a valid token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) throw new UnauthorizedException('يرجى تسجيل الدخول');
    let payload: { sub: number; stage?: string };
    try { payload = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException('انتهت الجلسة، يرجى تسجيل الدخول مجددًا'); }
    if (payload.stage) throw new UnauthorizedException('يلزم إكمال التحقق بخطوتين');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
    if (!user || !user.active) throw new UnauthorizedException('الحساب غير فعّال');
    req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role.code, permissions: user.role.permissions };
    const need = this.reflector.getAllAndOverride<string>(PERM_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (need && !can(user.role.permissions, need)) throw new ForbiddenException('لا تملك صلاحية تنفيذ هذه العملية');
    return true;
  }
}
