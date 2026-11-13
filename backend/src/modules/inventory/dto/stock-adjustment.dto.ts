import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { StockMovementType } from '@prisma/client';

export class StockAdjustmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Product ID is required' })
  productId: string;

  @IsNumber({}, { message: 'Adjustment quantity must be a valid number' })
  adjustmentQty: number;

  @IsString()
  @IsNotEmpty({ message: 'A reason for stock adjustment is required' })
  reason: string;

  @IsEnum(StockMovementType, {
    message: 'Movement type must be a valid StockMovementType (e.g. ADJUSTMENT, SPOILAGE, THEFT)',
  })
  @IsOptional()
  type?: StockMovementType;
}
