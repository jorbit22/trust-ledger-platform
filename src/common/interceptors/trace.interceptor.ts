import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4, validate as isUUID } from 'uuid';
import { RequestContextStore } from '../context/request-context';

// The front door of every request — runs before any business logic
@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Accept caller's trace ID only if it is genuinely a valid UUID string
    // Rejects arrays, crafted strings, and anything that could pollute logs
    const incoming = request.headers['x-trace-id'];
    const traceId =
      typeof incoming === 'string' && isUUID(incoming) ? incoming : uuidv4();

    // Echo back so the caller can match their records to our internal logs
    response.setHeader('x-trace-id', traceId);

    // x-forwarded-for is a comma-separated list when behind a proxy
    // We take only the first entry — the real customer IP, not the load balancer
    const forwarded = request.headers['x-forwarded-for'] as string;
    const ipAddress = forwarded?.split(',')[0] ?? request.ip ?? 'unknown';

    const ctx = {
      traceId,
      // userId may be undefined here if the auth guard hasn't run yet — that is fine
      // it gets picked up later by the logger and repository from request.user
      userId: request.user?.id,
      startedAt: Date.now(),
      ipAddress,
    };

    // Wrapping next.handle() inside run() ensures the entire RxJS stream —
    // including error handlers and response mappers — shares the same context
    return RequestContextStore.run(ctx, () => next.handle());
  }
}
