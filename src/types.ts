// Shared types for the Worker entry and the route modules.
export type Bindings = {
  DB: D1Database;
  RESEARCH_DB: D1Database;
  RESEARCH_INGEST_TOKEN: string;
  JWT_SECRET?: string; // signs login tokens: `wrangler pages secret put JWT_SECRET`, or .dev.vars locally
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
