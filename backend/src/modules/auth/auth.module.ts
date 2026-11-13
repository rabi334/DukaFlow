import { Module } from '@nestjs/common';
import { AuthController, BetterAuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [BetterAuthController, AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
