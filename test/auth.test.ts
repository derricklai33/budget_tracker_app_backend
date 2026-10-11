import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AUDIENCE, resetDb, setup, type TestContext, USER_SUB } from './helpers';

const NOT_AUTHENTICATED = { errors: ['Not Authenticated'] };
const RESOURCES = ['categories', 'expenses', 'incomes', 'goals', 'shares'];

describe('authentication (SecuredController)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setup();
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.close());

  describe.each(RESOURCES)('/%s', (resource) => {
    const routes: Array<[string, string]> = [
      ['get', `/${resource}`],
      ['post', `/${resource}`],
      ['get', `/${resource}/1`],
      ['patch', `/${resource}/1`],
      ['put', `/${resource}/1`],
      ['delete', `/${resource}/1`],
    ];

    it.each(routes)('%s %s without a token returns 401', async (method, path) => {
      const res = await (request(ctx.app) as unknown as Record<string, (p: string) => request.Test>)[method](path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(NOT_AUTHENTICATED);
    });

    it('GET index with a valid token succeeds', async () => {
      const res = await request(ctx.app).get(`/${resource}`).set('Authorization', `Bearer ${ctx.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  const invalidTokens: Array<[string, () => string]> = [
    ['a malformed token', () => 'not-a-jwt'],
    ['the wrong audience', () => ctx.sign({}, { audience: 'https://someone-else' })],
    ['the wrong issuer', () => ctx.sign({}, { issuer: 'https://evil.example/' })],
    ['an expired token', () => ctx.sign({}, { expiresIn: -60 })],
    ['a token signed by another key', () => ctx.sign({}, {}, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey)],
    ['an unknown key id', () => ctx.sign({}, { keyid: 'unknown' })],
    [
      'an HS256 token',
      () => jwt.sign({ sub: USER_SUB }, 'secret', { algorithm: 'HS256', issuer: ctx.domain, audience: AUDIENCE }),
    ],
  ];

  it.each(invalidTokens)('rejects %s with 401', async (_name, token) => {
    const res = await request(ctx.app).get('/categories').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(NOT_AUTHENTICATED);
  });

  it('uses the last segment of the Authorization header like AuthorizationService', async () => {
    const res = await request(ctx.app).get('/categories').set('Authorization', ctx.token);
    expect(res.status).toBe(200);
  });

  it('exposes the token subject as the current user', async () => {
    const now = new Date();
    await ctx.prisma.share.createMany({
      data: [
        { description: 'Mine', symbol: 'A', user_sub: USER_SUB, created_at: now, updated_at: now },
        { description: 'Theirs', symbol: 'B', user_sub: 'other', created_at: now, updated_at: now },
      ],
    });
    const res = await request(ctx.app).get('/shares').set('Authorization', `Bearer ${ctx.sign({ sub: 'other' })}`);
    expect(res.body.map((s: { description: string }) => s.description)).toEqual(['Theirs']);
  });
});
