import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { AccountCategory } from '../account.entity';

export class CreateAccountDto {
  @IsUUID()
  userId!: string;

  @IsEnum(AccountCategory)
  category!: AccountCategory;

  // Explicit allowlist — only currencies our GL and NIBSS integration support
  @IsString()
  @Length(3, 3)
  @Matches(/^(NGN|USD)$/, { message: 'Only NGN and USD are supported' })
  currency: string = 'NGN';

  @IsString()
  @Length(1, 20)
  glAccountCode!: string;

  @IsInt()
  @Min(1)
  kycTier: number = 1;

  // Accepted as a numeric string to safely handle values above Number.MAX_SAFE_INTEGER
  // Converted to BigInt in the service before any arithmetic
  @IsString()
  @Matches(/^\d+$/, { message: 'dailyLimitKobo must be a numeric string' })
  dailyLimitKobo: string = '10000000';
}
