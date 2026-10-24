// Eén JSON-regel per logbericht, zodat `docker compose logs` doorzoekbaar blijft.
type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? order.info;

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  if (order[level] < minLevel) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => write('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write('error', msg, data),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
