import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  businessType?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  tinNumber?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  taxRate?: number;

  @IsBoolean()
  @IsOptional()
  taxInclusive?: boolean;

  @IsString()
  @IsOptional()
  receiptHeader?: string;

  @IsString()
  @IsOptional()
  receiptFooter?: string;

  @IsBoolean()
  @IsOptional()
  allowNegative?: boolean;
}
