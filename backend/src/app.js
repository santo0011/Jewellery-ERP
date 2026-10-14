import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { sanitizeBody } from './middleware/sanitize.js';
import apiRoutes from './routes/index.js';
import { isLocalNetworkOrigin } from './utils/network.js';

/** Where the Android / iPhone app (Capacitor) serves its screens from. */
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost'];

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      // Routine requests log at debug (visible with LOG_LEVEL=debug); only server errors show by default.
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'debug'),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      // Listed origins, plus (outside production) any device on the local Wi-Fi, e.g. http://192.168.1.20:5173.
      origin: (origin, callback) => callback(null, !origin || env.corsOrigins.includes(origin) || (env.corsAllowLan && isLocalNetworkOrigin(origin)) || (env.CORS_ALLOW_APP && APP_ORIGINS.includes(origin))),
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );
  // The raw body is kept only for the payment webhook, whose signature covers the exact bytes.
  app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { if (req.originalUrl.includes('/webhook')) req.rawBody = buf.toString('utf8'); } }));
  app.use(cookieParser());
  app.use(sanitizeBody);

  app.use('/api', apiLimiter);
  app.use('/api/v1', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
