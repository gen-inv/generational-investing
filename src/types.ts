// Shared types for the Worker entry and the route modules.
export type Bindings = {
  DB: D1Database;
  RESEARCH_DB: D1Database;
  RESEARCH_INGEST_TOKEN: string;
}

// Alias for use in scheduled handler
export type CloudflareBindings = Bindings

// Cloudflare scheduled event interface
export interface ScheduledEvent {
  cron: string;
  type: 'scheduled';
  scheduledTime: number;
}

// Cloudflare execution context interface
export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}
