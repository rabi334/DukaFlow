import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { normalizeRole, AppRole } from '../auth/permissions';
import { MemberStatus } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const membership = request.membership;

    if (!membership || !membership.role) {
      throw new ForbiddenException('User membership role could not be verified in this business');
    }

    if (membership.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('User membership in this business is not active');
    }

    const userRole = normalizeRole(membership.role);
    if (!userRole) {
      throw new ForbiddenException(`Unknown or invalid user role: ${membership.role}`);
    }

    // Check if the user's normalized role matches one of the required roles
    const hasRole = requiredRoles.some((role) => {
      const targetRole = normalizeRole(role);
      // Owner has full operational and administrative access within their business
      if (userRole === AppRole.OWNER) return true;
      return userRole === targetRole;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient privileges: Required role [${requiredRoles.join(', ')}], your role is [${membership.role}]`,
      );
    }

    return true;
  }
}
