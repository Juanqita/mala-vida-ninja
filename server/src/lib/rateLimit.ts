import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Rate limit en memoria. Suficiente para una sola instancia (Render/Railway
 * free tier). Si algún día se escala a varias instancias, reemplazar por Redis.
 */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string }) {
  const buckets = new Map<string, Bucket>();

  // Limpieza periódica para no crecer sin control.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }, 60_000);
  timer.unref?.();

  return function (req: Request, res: Response, next: NextFunction) {
    const key =
      opts.key?.(req) ??
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';

    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > opts.max) {
      res.status(429).json({
        error: 'Demasiados intentos. Espera un momento.',
        code: 'RATE_LIMITED',
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}
