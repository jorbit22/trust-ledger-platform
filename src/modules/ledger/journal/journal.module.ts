import { Module } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/logger.service';
import { AccountModule } from '../account/account.module';
import { AccountRepository } from '../account/account.repository';
import { JournalController } from './journal.controller';
import { JournalRepository } from './journal.repository';
import { JournalService } from './journal.service';

@Module({
  imports: [AccountModule],
  controllers: [JournalController],
  providers: [JournalRepository, JournalService, AccountRepository, AppLogger],
  exports: [JournalService],
})
export class JournalModule {}
