import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthUser, ReqMeta } from './context';

type Tx = Prisma.TransactionClient | PrismaService;

const clean = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? String(x) : x))));

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(
    user: Pick<AuthUser, 'id' | 'username'> | null,
    action: string,
    entity: string,
    entityId: string | number | null,
    data: { before?: unknown; after?: unknown } = {},
    meta: ReqMeta = {},
    tx: Tx = this.prisma,
  ) {
    return tx.auditLog.create({
      data: {
        userId: user?.id, username: user?.username, action, entity,
        entityId: entityId == null ? null : String(entityId),
        before: clean(data.before) ?? Prisma.JsonNull, after: clean(data.after) ?? Prisma.JsonNull,
        ip: meta.ip, userAgent: meta.userAgent?.slice(0, 250),
      },
    });
  }
}
