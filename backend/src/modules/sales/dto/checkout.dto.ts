import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class CartItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Product ID is required for each cart item' })
  productId: string;

  @IsNumber()
  @IsPositive({ message: 'Quantity must be a positive number' })
  quantity: number;

  @IsNumber()
  @Min(0, { message: 'Unit price cannot be negative' })
  @IsOptional()
  unitPrice?: number;

  @IsNumber()
  @Min(0, { message: 'Discount amount cannot be negative' })
  @IsOptional()
  discountAmount?: number;
}

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Checkout cart must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];

  @IsEnum(PaymentMethod, {
    message: 'Payment method must be CASH, TELEBIRR, CBE_BIRR, BANK_TRANSFER, or CREDIT',
  })
  paymentMethod: PaymentMethod;

  @IsNumber()
  @Min(0, { message: 'Amount paid cannot be negative' })
  amountPaid: number;

  @IsString()
  @IsOptional()
  paymentReference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
