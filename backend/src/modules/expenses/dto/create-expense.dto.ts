import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty({ message: 'Expense category is required' })
  category: string;

  @IsNumber()
  @IsPositive({ message: 'Expense amount must be a positive number' })
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PaymentMethod, {
    message: 'Payment method must be CASH, TELEBIRR, CBE_BIRR, BANK_TRANSFER, or CREDIT',
  })
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsString()
  @IsOptional()
  date?: string;
}
