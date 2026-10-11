import cors from 'cors';
import type { RequestHandler } from 'express';

// Mirrors config/initializers/cors.rb (rack-cors).
export const ALLOWED_ORIGINS = ['https://tight20s.netlify.app', 'http://localhost:3000'];
const METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD';
const MAX_AGE = 7200;

const isAllowed = (origin: string | undefined): origin is string => !!origin && ALLOWED_ORIGINS.includes(origin);

const corsCore = cors({
  origin: (origin, callback) => callback(null, isAllowed(origin) ? origin : false),
  methods: METHODS,
  maxAge: MAX_AGE,
  optionsSuccessStatus: 200,
});

// rack-cors also sends Allow-Methods/Max-Age/Expose-Headers on actual requests, always varies on
// Origin, and answers preflights from unknown origins with an empty 200.
export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const preflight = req.method === 'OPTIONS' && !!origin && !!req.headers['access-control-request-method'];
  if (preflight) {
    // rack-cors preflight responses carry no Vary header.
    const end = res.end.bind(res) as (...args: unknown[]) => typeof res;
    res.end = ((...args: unknown[]) => {
      res.removeHeader('Vary');
      return end(...args);
    }) as typeof res.end;
  } else {
    res.vary('Origin');
  }
  if (!isAllowed(origin)) {
    if (preflight) {
      res.status(200).end();
      return;
    }
    next();
    return;
  }
  res.setHeader('Access-Control-Expose-Headers', '');
  if (!preflight) {
    res.setHeader('Access-Control-Allow-Methods', METHODS);
    res.setHeader('Access-Control-Max-Age', String(MAX_AGE));
  }
  corsCore(req, res, next);
};
