import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createAccount(@Body() dto: CreateAccountDto) {
    return this.accountService.createAccount(dto);
  }

  // ParseUUIDPipe rejects any non-UUID before it reaches the service
  @Get(':id')
  getAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountService.getAccount(id);
  }

  @Get('user/:userId')
  getAccountsByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.accountService.getAccountsByUser(userId);
  }

  @Patch(':id/freeze')
  freezeAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.accountService.freezeAccount(id, dto.version);
  }

  @Patch(':id/unfreeze')
  unfreezeAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.accountService.unfreezeAccount(id, dto.version);
  }

  @Patch(':id/dormant')
  markDormant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.accountService.markDormant(id, dto.version);
  }
}
