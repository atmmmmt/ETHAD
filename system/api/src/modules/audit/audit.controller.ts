import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Require } from '../../common/context';
import { PERMISSIONS } from '../../common/permissions';

@Controller('audit')
@Require(PERMISSIONS.AUDIT_VIEW)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query() q: { entity?: string; entityId?: string; user?: string; take?: string; before?: string }) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entity: q.entity || undefined,
        entityId: q.entityId || undefined,
        username: q.user || undefined,
        id: q.before ? { lt: BigInt(q.before) } : undefined,
      },
      orderBy: { id: 'desc' },
      take: Math.min(Number(q.take) || 100, 500),
    });
    return rows.map((r) => ({ ...r, id: String(r.id) }));
  }
}
