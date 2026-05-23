import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AppLogger } from '../../../common/logger/logger.service';
import { canTransact, getAvailableBalance } from '../account/account.entity';
import { AccountRepository } from '../account/account.repository';
import {
  JournalEntry,
  PostingInstruction,
  validatePostingInstruction,
} from './journal-entry.entity';
import { JournalRepository } from './journal.repository';

@Injectable()
export class JournalService {
  constructor(
    private readonly journalRepository: JournalRepository,
    private readonly accountRepository: AccountRepository,
    private readonly logger: AppLogger,
  ) {}

  async post(instruction: PostingInstruction): Promise<JournalEntry[]> {
    // Domain firewall — rejects zero, negative, and self-posting instructions
    validatePostingInstruction(instruction);

    // Early idempotency check — intercepts obvious duplicate retries
    // before acquiring any DB locks or starting a transaction
    const existing = await this.journalRepository.findByIdempotencyKey(
      instruction.idempotencyKey,
    );
    if (existing.length > 0) {
      this.logger.log('journal.posting.duplicate', {
        idempotencyKey: instruction.idempotencyKey,
        transactionId: instruction.transactionId,
      });
      return existing;
    }

    return this.journalRepository.executeInTransaction(async (client) => {
      // Second idempotency check inside the transaction
      // Catches the race where two requests both passed the first check
      // simultaneously before either committed
      const lockedExisting = await this.journalRepository.findByIdempotencyKey(
        instruction.idempotencyKey,
      );
      if (lockedExisting.length > 0) return lockedExisting;

      // Lock both accounts in sorted UUID order — prevents deadlocks when
      // two transfers involving the same accounts run simultaneously
      const accounts = await this.accountRepository.findManyForUpdate(
        [instruction.debitAccountId, instruction.creditAccountId],
        client,
      );

      const debitAccount = accounts.find(
        (a) => a.id === instruction.debitAccountId,
      );
      const creditAccount = accounts.find(
        (a) => a.id === instruction.creditAccountId,
      );

      if (!debitAccount) {
        throw new NotFoundException(
          `Debit account ${instruction.debitAccountId} not found`,
        );
      }

      if (!creditAccount) {
        throw new NotFoundException(
          `Credit account ${instruction.creditAccountId} not found`,
        );
      }

      // Cross-currency postings are rejected — no implicit FX conversion
      // A USD to NGN transfer must go through the FX engine, not here
      if (debitAccount.currency !== creditAccount.currency) {
        throw new BadRequestException(
          `Cross-currency posting rejected: cannot transfer from ${debitAccount.currency} to ${creditAccount.currency}`,
        );
      }

      if (!canTransact(debitAccount)) {
        throw new UnprocessableEntityException(
          `Debit account is ${debitAccount.status} and cannot transact`,
        );
      }

      if (!canTransact(creditAccount)) {
        throw new UnprocessableEntityException(
          `Credit account is ${creditAccount.status} and cannot transact`,
        );
      }

      const availableBalance = getAvailableBalance(debitAccount);
      if (availableBalance < instruction.amountKobo) {
        throw new UnprocessableEntityException(
          `Insufficient balance: available ${availableBalance} kobo, required ${instruction.amountKobo} kobo`,
        );
      }

      const resolvedInstruction: PostingInstruction = {
        ...instruction,
        debitGlCode: instruction.debitGlCode ?? debitAccount.glAccountCode,
        creditGlCode: instruction.creditGlCode ?? creditAccount.glAccountCode,
      };

      try {
        const entries = await this.journalRepository.post(
          resolvedInstruction,
          client,
        );

        // Balance math scoped to customer wallet accounts (liability accounts)
        // Debit decreases the wallet balance, credit increases it
        // Do not apply this math to asset GL accounts — the direction is reversed
        const newDebitBalance =
          debitAccount.balanceKobo - instruction.amountKobo;
        const debitUpdated = await this.accountRepository.updateBalances(
          debitAccount.id,
          { balanceKobo: newDebitBalance },
          debitAccount.version,
          client,
        );

        if (!debitUpdated) {
          throw new ConflictException(
            'Debit account version conflict — please retry',
          );
        }

        const newCreditBalance =
          creditAccount.balanceKobo + instruction.amountKobo;
        const creditUpdated = await this.accountRepository.updateBalances(
          creditAccount.id,
          { balanceKobo: newCreditBalance },
          creditAccount.version,
          client,
        );

        if (!creditUpdated) {
          throw new ConflictException(
            'Credit account version conflict — please retry',
          );
        }

        this.logger.log('journal.posting.success', {
          transactionId: instruction.transactionId,
          idempotencyKey: instruction.idempotencyKey,
          amountKobo: instruction.amountKobo.toString(),
          entryType: instruction.entryType,
          debitAccountId: instruction.debitAccountId,
          creditAccountId: instruction.creditAccountId,
        });

        return entries;
      } catch (error: any) {
        // DB unique constraint violation — idempotency key already exists
        // means a concurrent request beat us to the insert
        if (error.code === '23505') {
          throw new ConflictException(
            'Transaction already posted — idempotency key conflict',
          );
        }
        throw error;
      }
    });
  }

  async getEntriesByTransactionId(
    transactionId: string,
  ): Promise<JournalEntry[]> {
    const entries =
      await this.journalRepository.findByTransactionId(transactionId);

    if (entries.length === 0) {
      throw new NotFoundException(
        `No journal entries found for transaction ${transactionId}`,
      );
    }

    return entries;
  }

  async getEntriesByAccountId(
    accountId: string,
    limit = 50,
    offset = 0,
  ): Promise<JournalEntry[]> {
    return this.journalRepository.findByAccountId(accountId, limit, offset);
  }

  // Integrity check — computes balance from journal entries and compares
  // against the cached balance on the accounts table
  // Any discrepancy means the ledger and accounts table are out of sync
  async verifyAccountBalance(accountId: string): Promise<{
    cachedBalance: string;
    computedBalance: string;
    isConsistent: boolean;
  }> {
    const account = await this.accountRepository.findById(accountId);

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const computedBalance =
      await this.journalRepository.computeBalanceFromEntries(accountId);

    const isConsistent = account.balanceKobo === computedBalance;

    if (!isConsistent) {
      this.logger.error('journal.balance.inconsistency', {
        accountId,
        cachedBalance: account.balanceKobo.toString(),
        computedBalance: computedBalance.toString(),
      });
    }

    return {
      cachedBalance: account.balanceKobo.toString(),
      computedBalance: computedBalance.toString(),
      isConsistent,
    };
  }
}
