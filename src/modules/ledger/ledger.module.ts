import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module';
import { JournalModule } from './journal/journal.module';

@Module({
  imports: [AccountModule, JournalModule],
  exports: [AccountModule, JournalModule],
})
export class LedgerModule {}
