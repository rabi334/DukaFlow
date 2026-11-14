import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { AppPermission } from '../../common/auth/permissions';
import { OnboardBusinessDto } from './dto/onboard-business.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { MemberStatus } from '@prisma/client';

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
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner', 'manager', 'cashier', 'inventory_staff')
  async getCurrent(@CurrentTenant() org: any) {
    return this.businessService.getCurrentBusiness(org.id);
  }

  @Patch('settings')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner')
  @RequirePermissions(AppPermission.SETTINGS_MANAGE)
  async updateSettings(@CurrentTenant() org: any, @Body() dto: UpdateSettingsDto) {
    return this.businessService.updateSettings(org.id, dto);
  }

  @Get('members')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.STAFF_VIEW)
  async getMembers(@CurrentTenant() org: any) {
    return this.businessService.getMembers(org.id);
  }

  @Post('members/invite')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner')
  @RequirePermissions(AppPermission.STAFF_MANAGE)
  async inviteMember(
    @CurrentTenant() org: any,
    @CurrentUser() user: any,
    @CurrentMembership() member: any,
    @Body() body: { email: string; role: string },
  ) {
    return this.businessService.inviteMember(org.id, user.id, member.role, body.email, body.role);
  }

  @Patch('members/:id/role')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner')
  @RequirePermissions(AppPermission.STAFF_MANAGE)
  async updateMemberRole(
    @CurrentTenant() org: any,
    @Param('id') memberId: string,
    @Body() body: { role: string },
  ) {
    return this.businessService.updateMemberRole(org.id, memberId, body.role);
  }

  @Patch('members/:id/status')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner')
  @RequirePermissions(AppPermission.STAFF_MANAGE)
  async updateMemberStatus(
    @CurrentTenant() org: any,
    @Param('id') memberId: string,
    @Body() body: { status: MemberStatus },
  ) {
    return this.businessService.updateMemberStatus(org.id, memberId, body.status);
  }

  // ==========================================
  // INVITATIONS
  // ==========================================

  @Get('invitations')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner', 'manager')
  @RequirePermissions(AppPermission.STAFF_VIEW)
  async getInvitations(@CurrentTenant() org: any) {
    return this.businessService.getInvitations(org.id);
  }

  @Delete('invitations/:id')
  @UseGuards(AuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('owner')
  @RequirePermissions(AppPermission.STAFF_MANAGE)
  async cancelInvitation(@CurrentTenant() org: any, @Param('id') id: string) {
    return this.businessService.cancelInvitation(org.id, id);
  }

  @Get('invitations/my')
  @UseGuards(AuthGuard)
  async getMyInvitations(@CurrentUser() user: any) {
    return this.businessService.getMyInvitations(user.email);
  }

  @Post('invitations/:id/accept')
  @UseGuards(AuthGuard)
  async acceptInvitation(@Param('id') id: string, @CurrentUser() user: any) {
    return this.businessService.acceptInvitation(id, user.id, user.email);
  }
}
