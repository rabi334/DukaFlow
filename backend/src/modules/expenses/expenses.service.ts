import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod } from '@prisma/client';

export interface CreateExpenseDto {
  category: string;
  amount: number;
  description?: string;
  paymentMethod?: PaymentMethod;
  date?: string;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async getExpenses(organizationId: string, options?: { category?: string; limit?: number }) {
    const where: any = { organizationId };
    if (options?.category) {
      where.category = options.category;
    }

    return this.prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      take: options?.limit ?? 100,
    });
  }

  async createExpense(organizationId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        organizationId,
        category: dto.category,
        amount: dto.amount,
        description: dto.description,
        paymentMethod: dto.paymentMethod || PaymentMethod.CASH,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
  }

  async getExpenseCategories() {
    return [
      'Rent',
      'Electricity & Utilities',
      'Salaries & Wages',
      'Transport & Logistics',
      'Internet & Telecom',
      'Repairs & Maintenance',
      'Packaging & Supplies',
      'Other Expenses',
    ];
  }
}
