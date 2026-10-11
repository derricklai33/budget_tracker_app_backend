import request from 'supertest';
import { createCategory, resetDb, setup, type TestContext } from './helpers';

describe('Categories', () => {
  let ctx: TestContext;
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  beforeAll(async () => {
    ctx = await setup();
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.close());

  describe('GET /index', () => {
    it('renders all categories (not user-scoped)', async () => {
      await createCategory(ctx.prisma, 'Food');
      await createCategory(ctx.prisma, 'Rent');
      const res = await request(ctx.app).get('/categories').set(auth());
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(res.body.map((c: { description: string }) => c.description)).toEqual(['Food', 'Rent']);
    });
  });

  describe('GET /show', () => {
    it('renders a successful response', async () => {
      const category = await createCategory(ctx.prisma);
      const res = await request(ctx.app).get(`/categories/${category.id}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: Number(category.id),
        description: 'Food',
        created_at: category.created_at.toISOString(),
        updated_at: category.updated_at.toISOString(),
      });
      expect(Object.keys(res.body)).toEqual(['id', 'description', 'created_at', 'updated_at']);
    });

    it('returns 404 for a missing category', async () => {
      const res = await request(ctx.app).get('/categories/999').set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe('POST /create', () => {
    it('creates a new Category and renders it', async () => {
      const res = await request(ctx.app).post('/categories').set(auth()).send({ category: { description: 'Food' } });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 1, description: 'Food' });
      expect(res.headers.location).toMatch(/\/categories\/1$/);
      expect(await ctx.prisma.category.count()).toBe(1);
    });

    it('does not create a Category with invalid parameters and renders errors', async () => {
      const res = await request(ctx.app).post('/categories').set(auth()).send({ category: { description: '' } });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ description: ["can't be blank"] });
      expect(await ctx.prisma.category.count()).toBe(0);
    });

    it('returns 400 when the category param is missing', async () => {
      const res = await request(ctx.app).post('/categories').set(auth()).send({ category: {} });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH/PUT /update', () => {
    it.each(['patch', 'put'] as const)('%s updates the requested category', async (method) => {
      const category = await createCategory(ctx.prisma);
      const res = await request(ctx.app)[method](`/categories/${category.id}`).set(auth()).send({ category: { description: 'Groceries' } });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Groceries');
      expect((await ctx.prisma.category.findUnique({ where: { id: category.id } }))?.description).toBe('Groceries');
    });

    it('renders errors with invalid parameters', async () => {
      const category = await createCategory(ctx.prisma);
      const res = await request(ctx.app).patch(`/categories/${category.id}`).set(auth()).send({ category: { description: ' ' } });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ description: ["can't be blank"] });
    });
  });

  describe('DELETE /destroy', () => {
    it('destroys the requested category', async () => {
      const category = await createCategory(ctx.prisma);
      const res = await request(ctx.app).delete(`/categories/${category.id}`).set(auth());
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await ctx.prisma.category.count()).toBe(0);
    });
  });
});
