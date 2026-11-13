import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardBusinessDto } from './dto/onboard-business.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { MemberStatus } from '@prisma/client';

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
    });
  }
}
