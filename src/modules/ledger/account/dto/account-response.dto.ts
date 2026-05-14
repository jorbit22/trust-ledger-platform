import { Account } from '../account.entity';

// The only shape the outside world ever sees — raw DB rows never leave the service layer
export class AccountResponseDto {
  id!: string;
  userId!: string;
  category!: string;
  status!: string;
  currency!: string;

  // All kobo values returned as strings — JSON cannot safely represent bigint
  // Clients must treat these as arbitrary-precision integers, not floats
  balanceKobo!: string;
  holdBalanceKobo!: string;
  availableBalanceKobo!: string;
  dailyLimitKobo!: string;

  glAccountCode!: string;
  kycTier!: number;

  // Exposed so callers can participate in the optimistic locking cycle
  // A client performing a sensitive update must send back this version number
  version!: number;

  createdAt!: string;
  updatedAt!: string;

  static fromEntity(account: Account): AccountResponseDto {
    const dto = new AccountResponseDto();

    dto.id = account.id;
    dto.userId = account.userId;
    dto.category = account.category;
    dto.status = account.status;
    dto.currency = account.currency;
    dto.balanceKobo = account.balanceKobo.toString();
    dto.holdBalanceKobo = account.holdBalanceKobo.toString();

    const available = account.balanceKobo - account.holdBalanceKobo;
    dto.availableBalanceKobo = (available > 0n ? available : 0n).toString();

    dto.glAccountCode = account.glAccountCode;
    dto.kycTier = account.kycTier;
    dto.dailyLimitKobo = account.dailyLimitKobo.toString();
    dto.version = account.version;
    dto.createdAt = account.createdAt.toISOString();
    dto.updatedAt = account.updatedAt.toISOString();

    return dto;
  }
}
