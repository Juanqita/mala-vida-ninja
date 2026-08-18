import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import router from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path === '/api/health') return;
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });
    next();
  });

  app.use('/api', router);

  // Panel de administración (HTML de un solo archivo).
  const panelCandidates = [
    path.resolve(__dirname, 'admin/panel.html'),
    path.resolve(__dirname, '../src/admin/panel.html'),
    path.resolve(process.cwd(), 'server/src/admin/panel.html'),
  ];
  app.get(['/admin', '/admin/'], (_req, res) => {
    const found = panelCandidates.find((p) => fs.existsSync(p));
    if (!found) {
      res.status(404).send('Panel no encontrado');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fs.readFileSync(found, 'utf8'));
  });

  // En producción el mismo servicio sirve el juego ya compilado (web/dist).
  const webDistCandidates = [
    path.resolve(__dirname, 'public'), // bundle de producción (server/dist/public)
    path.resolve(__dirname, '../public'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(__dirname, '../../web/dist'),
  ];
  const webDist = webDistCandidates.find((p) => fs.existsSync(path.join(p, 'index.html')));

  if (webDist) {
    logger.info('Sirviendo frontend estático', { dir: webDist });
    app.use(express.static(webDist, { maxAge: '1h', index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Error no controlado', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Error interno del servidor', code: 'INTERNAL' });
  });

  return app;
}
