import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardBusinessDto } from './dto/onboard-business.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { MemberStatus } from '@prisma/client';
import { normalizeRole, AppRole } from '../../common/auth/permissions';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  async onboardBusiness(userId: string, dto: OnboardBusinessDto) {
    // Generate clean base slug from name
    const cleanName = dto.name.trim();
    const baseSlug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    let slug = baseSlug || 'business';
    const existingSlug = await this.prisma.organization.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
    }

    // Atomic interactive transaction:
    // 1. Create Organization
    // 2. Create initial Member with 'owner' role and ACTIVE status
    // 3. Seed standard Ethiopian retail categories
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: cleanName,
          slug,
          city: dto.city?.trim() || 'Addis Ababa',
          businessType: dto.businessType?.trim() || 'Retail',
          address: dto.address?.trim() || null,
          phoneNumber: dto.phoneNumber?.trim() || null,
          tinNumber: dto.tinNumber?.trim() || null,
          currency: dto.currency?.trim() || 'ETB',
          taxRate: 0.15,
          taxInclusive: true,
          allowNegative: false,
        },
      });

      const member = await tx.member.create({
        data: {
          organizationId: org.id,
          userId: userId,
          role: 'owner',
          status: MemberStatus.ACTIVE,
        },
      });

      // Default retail categories for new business
      const defaultCategories = [
        { name: 'Beverages & Drinks', description: 'Hot drinks, soft drinks, juices, and water' },
        { name: 'Dairy & Eggs', description: 'Milk, cheese, yogurt, and fresh eggs' },
        { name: 'Bakery & Grains', description: 'Bread, injera, flour, rice, and pasta' },
        { name: 'Personal Care', description: 'Soaps, hygiene, and body care products' },
        { name: 'Household Essentials', description: 'Cleaning supplies, detergents, and household goods' },
      ];

      await tx.category.createMany({
        data: defaultCategories.map((c) => ({
          organizationId: org.id,
          name: c.name,
          description: c.description,
        })),
      });

      return {
        message: 'Business workspace successfully created',
        business: org,
        membership: member,
      };
    });
  }

  async getCurrentBusiness(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        branches: true,
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Business workspace not found');
    }

    return org;
  }

  async updateSettings(organizationId: string, dto: UpdateSettingsDto) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name,
        currency: dto.currency,
        businessType: dto.businessType,
        address: dto.address,
        city: dto.city,
        phoneNumber: dto.phoneNumber,
        tinNumber: dto.tinNumber,
        taxRate: dto.taxRate !== undefined ? dto.taxRate : undefined,
        taxInclusive: dto.taxInclusive !== undefined ? dto.taxInclusive : undefined,
        receiptHeader: dto.receiptHeader,
        receiptFooter: dto.receiptFooter,
        allowNegative: dto.allowNegative !== undefined ? dto.allowNegative : undefined,
      },
    });
  }

  async getMembers(organizationId: string) {
    return this.prisma.member.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteMember(organizationId: string, inviterUserId: string, inviterRole: string, email: string, role: string) {
    const normRole = normalizeRole(role);
    if (!normRole) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    if (normRole === AppRole.PLATFORM_ADMIN) {
      throw new BadRequestException('Cannot invite platform admin to a business workspace');
    }

    // Only owner can invite another owner
    if (normRole === AppRole.OWNER && normalizeRole(inviterRole) !== AppRole.OWNER) {
      throw new ForbiddenException('Only business owners can assign the owner role');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // User doesn't exist yet: create invitation record linked to inviter user
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      return this.prisma.invitation.create({
        data: {
          organizationId,
          email: email.toLowerCase().trim(),
          role: normRole,
          expiresAt,
          inviterId: inviterUserId,
          status: 'pending',
        },
      });
    }

    // User exists: check if already a member
    const existing = await this.prisma.member.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (existing) {
      if (existing.status === MemberStatus.DEACTIVATED) {
        // Re-activate member
        return this.prisma.member.update({
          where: { id: existing.id },
          data: { status: MemberStatus.ACTIVE, role: normRole },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
      }
      throw new BadRequestException('User is already a member of this business workspace');
    }

    return this.prisma.member.create({
      data: {
        organizationId,
        userId: user.id,
        role: normRole,
        status: MemberStatus.ACTIVE,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async updateMemberRole(organizationId: string, memberId: string, newRole: string) {
    const normRole = normalizeRole(newRole);
    if (!normRole) {
      throw new BadRequestException(`Invalid role: ${newRole}`);
    }

    if (normRole === AppRole.PLATFORM_ADMIN) {
      throw new BadRequestException('Cannot set member role to platform admin');
    }

    const member = await this.prisma.member.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Business member not found');
    }

    // If changing role away from owner, ensure at least one other active owner remains
    if (member.role === 'owner' && normRole !== AppRole.OWNER) {
      const activeOwners = await this.prisma.member.count({
        where: {
          organizationId,
          role: 'owner',
          status: MemberStatus.ACTIVE,
        },
      });
      if (activeOwners <= 1) {
        throw new BadRequestException('Cannot demote the sole active owner of the business');
      }
    }

    return this.prisma.member.update({
      where: { id: memberId },
      data: { role: normRole },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async updateMemberStatus(organizationId: string, memberId: string, status: MemberStatus) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Business member not found');
    }

    // Disallow deactivating the sole active owner
    if (member.role === 'owner' && status === MemberStatus.DEACTIVATED) {
      const activeOwners = await this.prisma.member.count({
        where: {
          organizationId,
          role: 'owner',
          status: MemberStatus.ACTIVE,
        },
      });
      if (activeOwners <= 1) {
        throw new BadRequestException('Cannot deactivate the sole active owner of the business');
      }
    }

    return this.prisma.member.update({
      where: { id: memberId },
      data: { status },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  // ==========================================
  // INVITATIONS LIFECYCLE
  // ==========================================

  async getInvitations(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: { organizationId, status: 'pending' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelInvitation(organizationId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'cancelled' },
    });
  }

  async getMyInvitations(email: string) {
    return this.prisma.invitation.findMany({
      where: {
        email: email.toLowerCase().trim(),
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      include: {
        organization: { select: { id: true, name: true, city: true, businessType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvitation(invitationId: string, userId: string, userEmail: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { organization: true },
    });

    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Pending invitation not found');
    }

    if (new Date() > invitation.expiresAt) {
      await this.prisma.invitation.update({
        where: { id: invitationId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('This invitation has expired');
    }

    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    return this.prisma.$transaction(async (tx) => {
      // Check if user is already a member
      const existing = await tx.member.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: invitation.organizationId,
          },
        },
      });

      let membership;
      if (existing) {
        membership = await tx.member.update({
          where: { id: existing.id },
          data: {
            status: MemberStatus.ACTIVE,
            role: invitation.role || 'cashier',
          },
        });
      } else {
        membership = await tx.member.create({
          data: {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.role || 'cashier',
            status: MemberStatus.ACTIVE,
          },
        });
      }

      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'accepted' },
      });

      return {
        message: `Successfully joined ${invitation.organization.name}`,
        membership,
        organization: invitation.organization,
      };
    });
  }
}
