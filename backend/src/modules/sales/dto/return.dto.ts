import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class ReturnItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Sale item ID is required' })
  saleItemId: string;

  @IsNumber()
  @IsPositive({ message: 'Return quantity must be positive' })
  quantity: number;
}

export class ProcessReturnDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Must return at least one item' })
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @IsString()
  @IsOptional()
  reason?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  refundMethod?: PaymentMethod;

  @IsBoolean()
  @IsOptional()
  restockInventory?: boolean;
}
