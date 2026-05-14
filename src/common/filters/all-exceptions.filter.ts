import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // For HttpExceptions, getResponse() contains the full payload
    // including the array of validation messages from ValidationPipe
    const exceptionResponse: any =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: (exception as any)?.message || 'Internal server error' };

    // ValidationPipe returns message as an array of field errors
    // We join them into a readable string instead of showing "Bad Request"
    const message = Array.isArray(exceptionResponse.message)
      ? exceptionResponse.message.join(', ')
      : exceptionResponse.message || exceptionResponse;

    // Full context on every error — WHO made the request, WHERE it failed,
    // WHY it failed, and WHICH trace to follow in the logs
    this.logger.error('request.failed', {
      path: request.url,
      method: request.method,
      status,
      error_message: message,
      // PostgreSQL-specific fields — visible when a DB constraint fires
      db_code: (exception as any)?.code,
      db_detail: (exception as any)?.detail,
      stack: (exception as any)?.stack,
      traceId: request.headers['x-trace-id'] ?? 'no-trace',
    });

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
