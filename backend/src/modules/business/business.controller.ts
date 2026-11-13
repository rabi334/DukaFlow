import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@Controller('api/v1/business')
@UseGuards(AuthGuard, TenantGuard, RolesGuard)
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('current')
  async getCurrent(@CurrentTenant() org: any) {
    return this.businessService.getCurrentBusiness(org.id);
  }

  @Patch('settings')
  @Roles('owner')
  async updateSettings(@CurrentTenant() org: any, @Body() data: any) {
    return this.businessService.updateSettings(org.id, data);
  }

  @Get('members')
  @Roles('owner', 'manager')
  async getMembers(@CurrentTenant() org: any) {
    return this.businessService.getMembers(org.id);
  }
}
