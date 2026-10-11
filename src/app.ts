import type { PrismaClient } from '@prisma/client';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { createAuthenticate } from './auth';
import type { AuthConfig } from './config';
import { corsMiddleware } from './cors';
import { ParameterMissing, RecordNotFound } from './rails/params';
import { RAILS_DEFAULT_HEADERS, renderRailsError } from './rails/responses';
import { categoriesSpec, crudActions, expensesSpec, incomesSpec, sharesSpec } from './resources/crud';
import { goalsActions } from './resources/goals';
import { mountResource } from './resources/router';

export interface AppDependencies {
  prisma: PrismaClient;
  auth: AuthConfig;
}

const railsHeaders: RequestHandler = (_req, res, next) => {
  res.set(RAILS_DEFAULT_HEADERS);
  res.set('Cache-Control', 'no-cache');
  next();
};

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ParameterMissing || err?.type === 'entity.parse.failed') return renderRailsError(req, res, 400);
  if (err instanceof RecordNotFound) return renderRailsError(req, res, 404);
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.type) {
    return renderRailsError(req, res, 400);
  }
  console.error(err);
  renderRailsError(req, res, 500);
};

export function createApp({ prisma, auth }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.set('query parser', 'extended');
  app.set('case sensitive routing', true);

  app.use(corsMiddleware);

  const authenticate: RequestHandler[] = [railsHeaders, createAuthenticate(auth)];
  const router = express.Router({ caseSensitive: true });
  mountResource(router, 'shares', authenticate, crudActions(prisma, sharesSpec));
  mountResource(router, 'goals', authenticate, goalsActions(prisma));
  mountResource(router, 'incomes', authenticate, crudActions(prisma, incomesSpec));
  mountResource(router, 'expenses', authenticate, crudActions(prisma, expensesSpec));
  mountResource(router, 'categories', authenticate, crudActions(prisma, categoriesSpec));
  app.use(router);

  app.use((req, res) => renderRailsError(req, res, 404));
  app.use(errorHandler);
  return app;
}
