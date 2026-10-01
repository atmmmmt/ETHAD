import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export interface AuthUser { id: number; username: string; fullName: string; role: string; permissions: string[] }
export interface ReqMeta { ip?: string; userAgent?: string }

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): ReqMeta => {
  const r = ctx.switchToHttp().getRequest();
  return { ip: r.ip, userAgent: r.headers['user-agent'] };
});

export const PERM_KEY = 'perm';
/** Require a permission on a route (checked by AuthGuard). */
export const Require = (perm: string) => SetMetadata(PERM_KEY, perm);
export const PUBLIC_KEY = 'public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
