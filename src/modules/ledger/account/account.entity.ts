export interface Account {
  id: string;
  userId: string;
  category: AccountCategory;
  status: AccountStatus;
  currency: string;
  balanceKobo: bigint;
  holdBalanceKobo: bigint;
  glAccountCode: string;
  // Incremented on every update — used to detect concurrent modifications
  // If two requests read version=5 and both try to update, only one wins
  version: number;
  kycTier: number;
  dailyLimitKobo: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export enum AccountCategory {
  CUSTOMER = 'CUSTOMER',
  INTERNAL_FLOAT = 'INTERNAL_FLOAT',
  SUSPENSE = 'SUSPENSE',
  REVENUE = 'REVENUE',
  PROVIDER = 'PROVIDER',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  DORMANT = 'DORMANT',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

// Funds in hold are earmarked for pending payouts and cannot be spent
// Zero floor prevents a UI from ever showing a negative available balance
// even if a bug temporarily makes holdBalance exceed balance
export function getAvailableBalance(account: Account): bigint {
  const available = account.balanceKobo - account.holdBalanceKobo;
  return available > 0n ? available : 0n;
}

// Only ACTIVE accounts can move money — all other statuses are hard blocks
export function canTransact(account: Account): boolean {
  return account.status === AccountStatus.ACTIVE;
}

// JavaScript's JSON.stringify does not know how to handle bigint
// Without this patch every API response containing an account would crash
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
