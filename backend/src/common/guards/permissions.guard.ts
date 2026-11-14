import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AppPermission, roleHasPermission } from '../auth/permissions';
import { MemberStatus } from '@prisma/client';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<AppPermission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const membership = request.membership;

    if (!membership || !membership.role) {
      throw new ForbiddenException('User membership or role could not be verified in this business');
    }

    if (membership.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('User membership in this business is not active');
    }

    const missingPermissions = requiredPermissions.filter(
      (perm) => !roleHasPermission(membership.role, perm),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Insufficient privileges: Required permission(s) [${missingPermissions.join(', ')}] not granted to role [${membership.role}]`,
      );
    }

    return true;
  }
}
