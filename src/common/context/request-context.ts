import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  readonly traceId: string;
  readonly userId?: string;
  readonly startedAt: number;
  readonly ipAddress?: string;
}

// Think of this like a "clipboard" that travels with every request through
// the entire system — every service can read from it without being handed it
const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  // Locks the clipboard the moment a request starts — nothing can alter it afterwards
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(Object.freeze({ ...context }), fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  // If no request is active (e.g. a background job), we label it SYSTEM_INIT
  // so support teams know it wasn't a real user request when reading logs
  getTraceId(): string {
    return storage.getStore()?.traceId ?? 'SYSTEM_INIT';
  },

  getUserId(): string | undefined {
    return storage.getStore()?.userId;
  },

  // The customer's IP address is captured once at the door and shared everywhere
  // so we never have to ask "where did this request come from?" during an investigation
  getIpAddress(): string | undefined {
    return storage.getStore()?.ipAddress;
  },

  // Tells us how long the request has been running — useful for catching slow operations
  getDuration(): number {
    const store = storage.getStore();
    return store ? Date.now() - store.startedAt : 0;
  },
};
