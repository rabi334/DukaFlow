import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OnboardBusinessDto } from './dto/onboard-business.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('api/v1/business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post('onboard')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async onboard(@CurrentUser() user: any, @Body() dto: OnboardBusinessDto) {
    return this.businessService.onboardBusiness(user.id, dto);
  }

  @Get('current')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  async getCurrent(@CurrentTenant() org: any) {
    return this.businessService.getCurrentBusiness(org.id);
  }

  @Patch('settings')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles('owner')
  async updateSettings(@CurrentTenant() org: any, @Body() dto: UpdateSettingsDto) {
    return this.businessService.updateSettings(org.id, dto);
  }

  @Get('members')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard)
  @Roles('owner', 'manager')
  async getMembers(@CurrentTenant() org: any) {
    return this.businessService.getMembers(org.id);
  }
}
