import {
  Controller,
  All,
  Req,
  Res,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { auth } from '../../config/auth';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toNodeHandler: toBetterCallNodeHandler } = require('better-call/node');

const toNodeHandler = (authInstance: any) => {
  return 'handler' in authInstance
    ? toBetterCallNodeHandler(authInstance.handler)
    : toBetterCallNodeHandler(authInstance);
};

@Controller('api/auth')
export class BetterAuthController {
  @All('*')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    return toNodeHandler(auth)(req, res);
  }
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    return this.authService.logout(req.headers);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }
}
