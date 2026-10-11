import request from 'supertest';
import { resetDb, setup, type TestContext, USER_SUB } from './helpers';

describe('Shares', () => {
  let ctx: TestContext;
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const insert = (user_sub = USER_SUB, symbol = 'AAPL') => {
    const now = new Date();
    return ctx.prisma.share.create({ data: { description: 'Apple', symbol, user_sub, created_at: now, updated_at: now } });
  };
  beforeAll(async () => {
    ctx = await setup();
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.close());

  it("GET /index renders only the current user's shares", async () => {
    await insert(USER_SUB, 'AAPL');
    await insert('someone-else', 'MSFT');
    const res = await request(ctx.app).get('/shares').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.map((s: { symbol: string }) => s.symbol)).toEqual(['AAPL']);
  });

  it('GET /show renders the share', async () => {
    const share = await insert();
    const res = await request(ctx.app).get(`/shares/${share.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['id', 'description', 'symbol', 'user_sub', 'created_at', 'updated_at']);
  });

  it('GET /show returns 404 when not found', async () => {
    const res = await request(ctx.app).get('/shares/42').set(auth());
    expect(res.status).toBe(404);
  });

  it('POST /create creates a share', async () => {
    const res = await request(ctx.app).post('/shares').set(auth()).send({ share: { description: 'Apple', symbol: 'AAPL', user_sub: USER_SUB } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, description: 'Apple', symbol: 'AAPL', user_sub: USER_SUB });
    expect(await ctx.prisma.share.count()).toBe(1);
  });

  it('POST /create renders errors with invalid parameters', async () => {
    const res = await request(ctx.app).post('/shares').set(auth()).send({ share: { symbol: '' } });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ description: ["can't be blank"], symbol: ["can't be blank"], user_sub: ["can't be blank"] });
    expect(await ctx.prisma.share.count()).toBe(0);
  });

  it('PATCH /update updates the share', async () => {
    const share = await insert();
    const res = await request(ctx.app).patch(`/shares/${share.id}`).set(auth()).send({ share: { symbol: 'MSFT' } });
    expect(res.status).toBe(200);
    expect(res.body.symbol).toBe('MSFT');
  });

  it('PATCH /update renders errors with invalid parameters', async () => {
    const share = await insert();
    const res = await request(ctx.app).patch(`/shares/${share.id}`).set(auth()).send({ share: { user_sub: '' } });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ user_sub: ["can't be blank"] });
  });

  it('DELETE /destroy destroys the share', async () => {
    const share = await insert();
    const res = await request(ctx.app).delete(`/shares/${share.id}`).set(auth());
    expect(res.status).toBe(204);
    expect(await ctx.prisma.share.count()).toBe(0);
  });
});
