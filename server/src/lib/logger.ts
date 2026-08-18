type Level = 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
