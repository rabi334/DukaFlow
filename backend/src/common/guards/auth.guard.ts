import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { auth } from '../../config/auth';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. Try Better Auth session resolution via request headers / cookies
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (session && session.user && session.session) {
        request.user = session.user;
        request.session = session.session;
        return true;
      }
    } catch {
      // Better auth resolution threw, attempt bearer token fallback below
    }

    // 2. Bearer token extraction and validation directly from database session table
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        const sessionRecord = await this.prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });

        if (sessionRecord) {
          // Verify session expiration
          if (new Date(sessionRecord.expiresAt) > new Date()) {
            request.user = sessionRecord.user;
            request.session = sessionRecord;
            return true;
          }
        }
      }
    }

    // Absolutely NO header-based identity fallbacks (x-user-id, x-user-email).
    // All unauthenticated, invalid, or expired sessions are rejected immediately with 401.
    throw new UnauthorizedException('Authentication required. Please sign in with valid credentials.');
  }
}
