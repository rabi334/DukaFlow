import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { auth } from '../../config/auth';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    try {
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });

      if (existingUser) {
        throw new ConflictException('An account with this email address already exists');
      }

      // Call Better Auth programmatic signup
      const result: any = await auth.api.signUpEmail({
        body: {
          name: dto.name.trim(),
          email: dto.email.toLowerCase().trim(),
          password: dto.password,
        },
      });

      const token = result.token;
      let sessionRecord = null;
      if (token) {
        sessionRecord = await this.prisma.session.findUnique({
          where: { token },
        });
      }

      return {
        message: 'Account successfully registered',
        user: result.user,
        token: token,
        session: sessionRecord,
      };
    } catch (error: any) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error.message || 'Registration failed. Please try again.',
      );
    }
  }

  async login(dto: LoginDto) {
    try {
      const result: any = await auth.api.signInEmail({
        body: {
          email: dto.email.toLowerCase().trim(),
          password: dto.password,
        },
      });

      if (!result || !result.user) {
        throw new UnauthorizedException('Invalid email or password');
      }

      const token = result.token;
      let sessionRecord = null;
      if (token) {
        sessionRecord = await this.prisma.session.findUnique({
          where: { token },
        });
      }

      return {
        message: 'Login successful',
        user: result.user,
        token: token,
        session: sessionRecord,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (
        error.status === 401 ||
        error.statusCode === 401 ||
        error.code === 'INVALID_EMAIL_OR_PASSWORD'
      ) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw new UnauthorizedException(error.message || 'Invalid email or password');
    }
  }

  async logout(headers: any) {
    try {
      // If bearer token present, delete from session table
      const authHeader = headers['authorization'];
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        await this.prisma.session.deleteMany({
          where: { token },
        });
      }

      // Also call Better Auth signOut API
      await auth.api
        .signOut({
          headers,
        })
        .catch(() => null);

      return { message: 'Successfully signed out' };
    } catch {
      return { message: 'Signed out' };
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const memberships = await this.prisma.member.findMany({
      where: { userId },
      include: {
        organization: true,
      },
    });

    return {
      user,
      workspaces: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        currency: m.organization.currency,
        businessType: m.organization.businessType,
        city: m.organization.city,
        role: m.role,
        status: m.status,
      })),
    };
  }
}
