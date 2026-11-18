import { IsOptional, IsString, IsEnum, IsNumber, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, SaleStatus, StockMovementType, PurchaseStatus } from '@prisma/client';

export enum DatePreset {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export class ReportQueryDto {
  @IsOptional()
  @IsEnum(DatePreset)
  preset?: DatePreset = DatePreset.THIS_MONTH;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @IsOptional()
  @IsEnum(PurchaseStatus)
  purchaseStatus?: PurchaseStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CsvExportQueryDto extends ReportQueryDto {
  @IsString()
  reportType!: string; // 'sales_summary' | 'sales_details' | 'profit_loss' | 'cash_flow' | 'receivables' | 'tax_summary' | 'inventory_valuation' | 'inventory_movements' | 'product_performance' | 'purchases' | 'expenses' | 'staff'
}
