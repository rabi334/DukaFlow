import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User session not established');
    }

    // Resolve target Organization/Workspace:
    // Header 'x-organization-id' OR query parameter OR session active organization
    let orgId = request.headers['x-organization-id'] || request.session?.activeOrganizationId;

    if (!orgId) {
      // Find default active organization for this user
      const defaultMembership = await this.prisma.member.findFirst({
        where: { userId: user.id },
        include: { organization: true },
      });

      if (!defaultMembership) {
        throw new ForbiddenException('User does not belong to any business organization');
      }

      request.organization = defaultMembership.organization;
      request.membership = defaultMembership;
      return true;
    }

    // Verify user belongs to the requested organization
    const membership = await this.prisma.member.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: String(orgId),
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied: You do not have permission for this business workspace');
    }

    request.organization = membership.organization;
    request.membership = membership;
    return true;
  }
}
