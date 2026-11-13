import { Module } from '@nestjs/common';
import { AuthController, AuthProfileController } from './auth.controller';

@Module({
  controllers: [AuthController, AuthProfileController],
})
export class AuthModule {}
