import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppLogger } from '../../../common/logger/logger.service';
import { AccountCategory, AccountStatus } from './account.entity';
import { AccountRepository } from './account.repository';
import { AccountResponseDto } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';

@Injectable()
export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly logger: AppLogger,
  ) {}

  // CBN KYC tier daily spend limits in kobo
  // These are the regulatory maximums — no account can exceed its tier cap
  // regardless of what the API caller requests
  private readonly TIER_LIMITS: Record<number, bigint> = {
    1: 5_000_000n, // 50,000 NGN
    2: 20_000_000n, // 200,000 NGN
    3: 500_000_000n, // 5,000,000 NGN
  };

  async createAccount(dto: CreateAccountDto): Promise<AccountResponseDto> {
    const existing = await this.accountRepository.findByUserId(dto.userId);
    const duplicate = existing.find(
      (a) =>
        a.category === dto.category &&
        a.currency === dto.currency &&
        a.status !== AccountStatus.CLOSED,
    );

    if (duplicate) {
      throw new ConflictException(
        `Active ${dto.category} account in ${dto.currency} already exists for this user`,
      );
    }

    // Cap the requested limit to the tier maximum
    // Protects the bank from accidental over-exposure regardless of DTO input
    const tierLimit = this.TIER_LIMITS[dto.kycTier] ?? 0n;
    const requestedLimit = BigInt(dto.dailyLimitKobo);
    const dailyLimitKobo =
      requestedLimit > tierLimit ? tierLimit : requestedLimit;

    try {
      const account = await this.accountRepository.create({
        userId: dto.userId,
        category: dto.category as AccountCategory,
        currency: dto.currency,
        glAccountCode: dto.glAccountCode,
        kycTier: dto.kycTier,
        dailyLimitKobo,
      });

      this.logger.log('account.created', {
        accountId: account.id,
        userId: account.userId,
        category: account.category,
        currency: account.currency,
        kycTier: account.kycTier,
      });

      return AccountResponseDto.fromEntity(account);
    } catch (error: any) {
      // PostgreSQL unique constraint violation — race condition where two
      // simultaneous requests both passed the application-level check above
      if (error.code === '23505') {
        throw new ConflictException(
          'Account creation already in progress or account already exists',
        );
      }
      throw error;
    }
  }

  async getAccount(id: string): Promise<AccountResponseDto> {
    const account = await this.accountRepository.findById(id);

    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    return AccountResponseDto.fromEntity(account);
  }

  async getAccountsByUser(userId: string): Promise<AccountResponseDto[]> {
    const accounts = await this.accountRepository.findByUserId(userId);
    return accounts.map(AccountResponseDto.fromEntity);
  }

  async freezeAccount(
    id: string,
    version: number,
  ): Promise<AccountResponseDto> {
    return this.updateAccountStatus(id, AccountStatus.FROZEN, version);
  }

  async unfreezeAccount(
    id: string,
    version: number,
  ): Promise<AccountResponseDto> {
    return this.updateAccountStatus(id, AccountStatus.ACTIVE, version);
  }

  async markDormant(id: string, version: number): Promise<AccountResponseDto> {
    return this.updateAccountStatus(id, AccountStatus.DORMANT, version);
  }

  private async updateAccountStatus(
    id: string,
    status: AccountStatus,
    version: number,
  ): Promise<AccountResponseDto> {
    const account = await this.accountRepository.findById(id);

    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    // CLOSED is a terminal state — no further status transitions allowed
    if (account.status === AccountStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot update the status of a closed account',
      );
    }

    const updated = await this.accountRepository.updateStatusTransactional(
      id,
      status,
      version,
    );

    // Null means the version did not match — another process updated
    // this account between our read and our write
    if (!updated) {
      throw new ConflictException(
        'Account was modified by another process — please retry',
      );
    }

    this.logger.log('account.status.updated', { accountId: id, status });

    return AccountResponseDto.fromEntity(updated);
  }
}
