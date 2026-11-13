import { Controller, All, Req, Res, Get, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../../config/auth';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/auth')
export class AuthController {
  @All('*')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(auth)(req, res);
  }
}

@Controller('api/v1/auth')
export class AuthProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() user: any) {
    const memberships = await this.prisma.member.findMany({
      where: { userId: user.id },
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
        role: m.role,
      })),
    };
  }
}
