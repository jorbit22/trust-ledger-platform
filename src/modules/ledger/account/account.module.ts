import { Module } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/logger.service';
import { AccountController } from './account.controller';
import { AccountRepository } from './account.repository';
import { AccountService } from './account.service';

// DatabaseModule is @Global — PG_POOL is automatically available here
// No need to import it explicitly in every module
@Module({
  controllers: [AccountController],
  providers: [AccountRepository, AccountService, AppLogger],
  exports: [AccountService],
})
export class AccountModule {}
