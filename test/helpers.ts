import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';

export const AUDIENCE = 'https://budget-api.test';
export const USER_SUB = 'auth0|test-user';
const KID = 'test-key';

export interface TestContext {
  app: Express;
  prisma: PrismaClient;
  domain: string;
  /** Bearer token for USER_SUB signed by the test JWKS key. */
  token: string;
  sign(claims?: object, options?: jwt.SignOptions, key?: KeyObject | string): string;
  close(): Promise<void>;
}

// Boots the app against a local JWKS endpoint so tokens go through real RS256/JWKS verification.
export async function setup(): Promise<TestContext> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwks = JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] });
  const server = http.createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(jwks);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const domain = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  const prisma = new PrismaClient();
  const app = createApp({ prisma, auth: { domain, apiIdentifier: AUDIENCE } });
  const sign: TestContext['sign'] = (claims = {}, options = {}, key = privateKey) =>
    jwt.sign({ sub: USER_SUB, ...claims }, key, {
      algorithm: 'RS256',
      keyid: KID,
      issuer: domain,
      audience: AUDIENCE,
      expiresIn: '1h',
      ...options,
    });

  return {
    app,
    prisma,
    domain,
    token: sign(),
    sign,
    close: async () => {
      await prisma.$disconnect();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function resetDb(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe('TRUNCATE expenses, incomes, goals, shares, categories RESTART IDENTITY CASCADE');
}

export function createCategory(prisma: PrismaClient, description = 'Food') {
  const now = new Date();
  return prisma.category.create({ data: { description, created_at: now, updated_at: now } });
}
