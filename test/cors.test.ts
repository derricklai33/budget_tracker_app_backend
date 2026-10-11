import request from 'supertest';
import { setup, type TestContext } from './helpers';

describe('CORS (config/initializers/cors.rb)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => ctx.close());

  it.each(['https://tight20s.netlify.app', 'http://localhost:3000'])('allows preflight from %s', async (origin) => {
    const res = await request(ctx.app)
      .options('/expenses')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    expect(res.headers['access-control-allow-headers']).toBe('authorization,content-type');
    expect(res.headers['access-control-max-age']).toBe('7200');
  });

  it('sends no CORS headers to other origins', async () => {
    const res = await request(ctx.app).options('/expenses').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('adds CORS headers to actual requests, including 401s', async () => {
    const res = await request(ctx.app).get('/categories').set('Origin', 'https://tight20s.netlify.app');
    expect(res.status).toBe(401);
    expect(res.headers['access-control-allow-origin']).toBe('https://tight20s.netlify.app');
    expect(res.headers.vary).toContain('Origin');
  });
});
