import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { JournalEntryType, PostingInstruction } from './journal-entry.entity';
import { JournalService } from './journal.service';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

class PostingInstructionDto {
  @IsUUID()
  transactionId!: string;

  @IsString()
  idempotencyKey!: string;

  @IsUUID()
  debitAccountId!: string;

  @IsUUID()
  creditAccountId!: string;

  // Accepted as numeric string to safely handle large kobo values
  @IsString()
  @Matches(/^\d+$/, { message: 'amountKobo must be a numeric string' })
  amountKobo!: string;

  @IsEnum(JournalEntryType)
  entryType!: JournalEntryType;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  debitGlCode?: string;

  @IsOptional()
  @IsString()
  creditGlCode?: string;
}

@Controller('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post('post')
  @HttpCode(HttpStatus.CREATED)
  async postTransaction(@Body() dto: PostingInstructionDto) {
    const instruction: PostingInstruction = {
      ...dto,
      // Convert from string to BigInt here — never earlier
      amountKobo: BigInt(dto.amountKobo),
    };
    const entries = await this.journalService.post(instruction);
    return entries.map((e) => ({
      ...e,
      amountKobo: e.amountKobo.toString(),
    }));
  }

  @Get('transaction/:transactionId')
  async getByTransaction(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    const entries =
      await this.journalService.getEntriesByTransactionId(transactionId);
    return entries.map((e) => ({
      ...e,
      amountKobo: e.amountKobo.toString(),
    }));
  }

  @Get('account/:accountId')
  async getByAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    const entries = await this.journalService.getEntriesByAccountId(
      accountId,
      Number(limit),
      Number(offset),
    );
    return entries.map((e) => ({
      ...e,
      amountKobo: e.amountKobo.toString(),
    }));
  }

  @Get('account/:accountId/verify')
  verifyBalance(@Param('accountId', ParseUUIDPipe) accountId: string) {
    return this.journalService.verifyAccountBalance(accountId);
  }
}
