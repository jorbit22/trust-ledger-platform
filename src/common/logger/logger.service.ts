import { Injectable, LoggerService } from '@nestjs/common';
import { RequestContextStore } from '../context/request-context';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// Any field in this list will be replaced with [REDACTED] in every log entry
// Protects customer PII and satisfies NDPR and PCI-DSS requirements
const SENSITIVE_FIELDS = new Set([
  'bvn',
  'nin',
  'pin',
  'password',
  'cvv',
  'card_number',
  'account_number',
  'secret',
  'token',
  'authorization',
]);

// Walks through any object before logging it
// WeakSet tracks visited objects to safely handle circular references
// without crashing — a plain object spread or JSON.stringify would throw
function sanitize(val: any, seen = new WeakSet()): any {
  if (val === null || typeof val !== 'object') return val;
  if (seen.has(val)) return '[Circular]';

  if (Array.isArray(val)) {
    return val.map((item) => sanitize(item, seen));
  }

  seen.add(val);
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(val)) {
    result[key] = SENSITIVE_FIELDS.has(key.toLowerCase())
      ? '[REDACTED]'
      : sanitize(value, seen);
  }

  return result;
}

@Injectable()
export class AppLogger implements LoggerService {
  private readonly logLevel: LogLevel =
    (process.env.LOG_LEVEL as LogLevel) ?? 'info';

  private readonly priorities: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private write(level: LogLevel, message: string, meta?: any): void {
    if (this.priorities[level] < this.priorities[this.logLevel]) return;

    let errorDetails = {};
    if (meta instanceof Error) {
      errorDetails = {
        error_name: meta.name,
        error_message: meta.message,
        stack: meta.stack,
      };
      meta = {};
    }

    // NestJS internally passes a string context as meta (e.g. "InstanceLoader")
    // We wrap it in an object so it does not get spread character by character
    const safeMeta = typeof meta === 'string' ? { context: meta } : meta;

    const entry = {
      level,
      message,
      traceId: RequestContextStore.getTraceId(),
      userId: RequestContextStore.getUserId(),
      ipAddress: RequestContextStore.getIpAddress(),
      durationMs: RequestContextStore.getDuration(),
      timestamp: new Date().toISOString(),
      service: process.env.SERVICE_NAME ?? 'trust-ledger-api',
      ...errorDetails,
      ...(safeMeta ? sanitize(safeMeta) : {}),
    };

    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  log(msg: string, meta?: any): void {
    this.write('info', msg, meta);
  }
  warn(msg: string, meta?: any): void {
    this.write('warn', msg, meta);
  }
  debug(msg: string, meta?: any): void {
    this.write('debug', msg, meta);
  }

  error(msg: string, stack?: any, context?: string): void {
    if (stack instanceof Error) {
      this.write('error', msg, stack);
    } else if (typeof stack === 'object' && stack !== null) {
      this.write('error', msg, {
        error_message: stack.message ?? JSON.stringify(stack),
        stack: stack.stack,
        context,
      });
    } else {
      this.write('error', msg, { stack, context });
    }
  }

  logQuery(sql: string, durationMs: number): void {
    this.write('debug', 'db.query', {
      sql: sql.substring(0, 500),
      durationMs,
    });
  }
}
