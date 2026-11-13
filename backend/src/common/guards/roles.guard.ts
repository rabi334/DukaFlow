import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

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
      throw new ForbiddenException('User membership role could not be verified');
    }

    // Role hierarchy / equivalence (owner has full access to everything)
    const userRole = membership.role.toLowerCase();
    const hasRole = requiredRoles.some((role) => {
      const targetRole = role.toLowerCase();
      if (userRole === 'owner') return true; // Owner has all permissions
      if (userRole === 'admin') return true; // Admin has all permissions
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
