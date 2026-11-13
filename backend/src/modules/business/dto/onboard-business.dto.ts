import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class OnboardBusinessDto {
  @IsString()
  @IsNotEmpty({ message: 'Business name is required' })
  @MinLength(2, { message: 'Business name must be at least 2 characters' })
  name: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  businessType?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  tinNumber?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}
