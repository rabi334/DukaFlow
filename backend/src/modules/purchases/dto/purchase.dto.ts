import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Product ID is required' })
  productId: string;

  @IsNumber()
  @IsPositive({ message: 'Ordered quantity must be positive' })
  orderedQty: number;

  @IsNumber()
  @IsPositive({ message: 'Unit cost must be positive' })
  unitCost: number;
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty({ message: 'Supplier ID is required' })
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Purchase order must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReceivedItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Purchase item ID is required' })
  purchaseItemId: string;

  @IsNumber()
  @IsPositive({ message: 'Received quantity must be positive' })
  receivedQty: number;
}

export class ReceiveItemsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Must receive at least one item' })
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  receivedItems: ReceivedItemDto[];
}

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'Supplier name is required' })
  name: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  tinNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  tinNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
