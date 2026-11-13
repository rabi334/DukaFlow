import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

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

  async updateSettings(organizationId: string, data: any) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: data.name,
        currency: data.currency,
        businessType: data.businessType,
        address: data.address,
        city: data.city,
        phoneNumber: data.phoneNumber,
        tinNumber: data.tinNumber,
        taxRate: data.taxRate !== undefined ? data.taxRate : undefined,
        taxInclusive: data.taxInclusive !== undefined ? data.taxInclusive : undefined,
        receiptHeader: data.receiptHeader,
        receiptFooter: data.receiptFooter,
        allowNegative: data.allowNegative !== undefined ? data.allowNegative : undefined,
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
