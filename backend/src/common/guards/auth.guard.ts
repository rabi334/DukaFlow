import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { auth } from '../../config/auth';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    try {
      // 1. Try Better Auth session resolution
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (session && session.user) {
        request.user = session.user;
        request.session = session.session;
        return true;
      }
    } catch {
      // Better auth resolution threw, check fallback below
    }

    // 2. Development / Header fallback (for easy API testing / Postman / Swagger)
    const testUserId = request.headers['x-user-id'] || request.headers['x-user-email'];
    if (testUserId) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: String(testUserId) },
            { email: String(testUserId) },
          ],
        },
      });

      if (user) {
        request.user = user;
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required. Please sign in.');
  }
}
