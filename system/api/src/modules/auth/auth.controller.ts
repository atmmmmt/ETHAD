import { BadRequestException, Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Meta, Public, ReqMeta } from '../../common/context';

authenticator.options = { window: 1 };

// simple brute-force protection: 5 failures per username per 15 minutes
const failures = new Map<string, { n: number; until: number }>();
const LOCK_MS = 15 * 60 * 1000;

export function passwordProblem(p: string): string | null {
  if (!p || p.length < 10) return 'كلمة المرور يجب أن تكون 10 أحرف على الأقل';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'كلمة المرور يجب أن تحتوي على أحرف وأرقام';
  return null;
}

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  private issue(userId: number) {
    return this.jwt.signAsync({ sub: userId }, { expiresIn: '8h' });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() b: { username: string; password: string }, @Meta() meta: ReqMeta) {
    const username = String(b?.username || '').trim().toLowerCase();
    const f = failures.get(username);
    if (f && f.n >= 5 && f.until > Date.now()) throw new UnauthorizedException('تم إيقاف المحاولات مؤقتًا، حاول بعد 15 دقيقة');
    const user = await this.prisma.user.findUnique({ where: { username }, include: { role: true } });
    const ok = user && user.active && (await bcrypt.compare(String(b?.password || ''), user.passwordHash));
    if (!ok) {
      const cur = failures.get(username);
      failures.set(username, { n: (cur && cur.until > Date.now() ? cur.n : 0) + 1, until: Date.now() + LOCK_MS });
      await this.audit.log(null, 'LOGIN_FAILED', 'User', username, {}, meta);
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    failures.delete(username);
    if (user.totpEnabled) {
      const temp = await this.jwt.signAsync({ sub: user.id, stage: '2fa' }, { expiresIn: '5m' });
      return { requires2fa: true, tempToken: temp };
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log(user, 'LOGIN', 'User', user.id, {}, meta);
    return { token: await this.issue(user.id) };
  }

  @Public()
  @Post('login/2fa')
  @HttpCode(200)
  async login2fa(@Body() b: { tempToken: string; code: string }, @Meta() meta: ReqMeta) {
    let p: { sub: number; stage?: string };
    try { p = await this.jwt.verifyAsync(b.tempToken); } catch { throw new UnauthorizedException('انتهت مهلة التحقق، سجّل الدخول مجددًا'); }
    if (p.stage !== '2fa') throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: p.sub } });
    if (!user?.totpSecret || !authenticator.check(String(b.code || ''), user.totpSecret)) {
      await this.audit.log(user, 'LOGIN_2FA_FAILED', 'User', p.sub, {}, meta);
      throw new UnauthorizedException('رمز التحقق غير صحيح');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log(user, 'LOGIN', 'User', user.id, {}, meta);
    return { token: await this.issue(user.id) };
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.prisma.user.findUnique({
      where: { id: u.id },
      select: { id: true, username: true, fullName: true, totpEnabled: true, lastLoginAt: true, role: { select: { code: true, name: true, permissions: true } } },
    });
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(@CurrentUser() u: AuthUser, @Body() b: { current: string; next: string }, @Meta() meta: ReqMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await bcrypt.compare(String(b.current || ''), user.passwordHash))) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    const problem = passwordProblem(b.next);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(b.next, 12) } });
    await this.audit.log(u, 'PASSWORD_CHANGED', 'User', u.id, {}, meta);
    return { ok: true };
  }

  @Post('2fa/setup')
  @HttpCode(200)
  async setup2fa(@CurrentUser() u: AuthUser) {
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: u.id }, data: { totpSecret: secret, totpEnabled: false } });
    const uri = authenticator.keyuri(u.username, 'Al-Ahli SC ERP', secret);
    return { secret, qr: await QRCode.toDataURL(uri) };
  }

  @Post('2fa/enable')
  @HttpCode(200)
  async enable2fa(@CurrentUser() u: AuthUser, @Body() b: { code: string }, @Meta() meta: ReqMeta) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!user.totpSecret || !authenticator.check(String(b.code || ''), user.totpSecret)) throw new BadRequestException('رمز التحقق غير صحيح');
    await this.prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true } });
    await this.audit.log(u, '2FA_ENABLED', 'User', u.id, {}, meta);
    return { ok: true };
  }
}
