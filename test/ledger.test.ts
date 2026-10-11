import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createCategory, resetDb, setup, type TestContext, USER_SUB } from './helpers';

// ExpensesController and IncomesController are identical apart from the model.
describe.each([
  ['expenses', 'expense'],
  ['incomes', 'income'],
] as const)('/%s', (resource, paramKey) => {
  let ctx: TestContext;
  let categoryId: bigint;
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const model = (prisma: PrismaClient) => (resource === 'expenses' ? prisma.expense : prisma.income) as unknown as PrismaClient['expense'];
  const validAttributes = () => ({
    description: 'Lunch',
    amount: 12.5,
    category_id: Number(categoryId),
    user_sub: USER_SUB,
    title: 'Lunch out',
    date: '2021-02-04',
  });
  const insert = (attrs: Partial<{ user_sub: string; description: string }> = {}) => {
    const now = new Date();
    return model(ctx.prisma).create({
      data: { ...validAttributes(), category_id: categoryId, date: new Date('2021-02-04'), created_at: now, updated_at: now, ...attrs },
    });
  };

  beforeAll(async () => {
    ctx = await setup();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    categoryId = (await createCategory(ctx.prisma)).id;
  });
  afterAll(() => ctx.close());

  describe('GET /index', () => {
    it("renders only the current user's records", async () => {
      await insert({ description: 'mine' });
      await insert({ description: 'theirs', user_sub: 'someone-else' });
      const res = await request(ctx.app).get(`/${resource}`).set(auth());
      expect(res.status).toBe(200);
      expect(res.body.map((r: { description: string }) => r.description)).toEqual(['mine']);
    });
  });

  describe('GET /show', () => {
    it('renders the record with Rails JSON formatting', async () => {
      const record = await insert();
      const res = await request(ctx.app).get(`/${resource}/${record.id}`).set(auth());
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['id', 'description', 'amount', 'category_id', 'created_at', 'updated_at', 'user_sub', 'title', 'date']);
      expect(res.body).toMatchObject({ amount: 12.5, category_id: Number(categoryId), date: '2021-02-04' });
    });

    it('returns 404 for a missing record', async () => {
      const res = await request(ctx.app).get(`/${resource}/999`).set(auth());
      expect(res.status).toBe(404);
    });
  });

  describe('POST /create', () => {
    it('creates a record and renders it with 201', async () => {
      const res = await request(ctx.app).post(`/${resource}`).set(auth()).send({ [paramKey]: { ...validAttributes(), amount: 12 } });
      expect(res.status).toBe(201);
      expect(res.text).toContain('"amount":12.0');
      expect(res.body).toMatchObject({ ...validAttributes(), amount: 12 });
      expect(await model(ctx.prisma).count()).toBe(1);
    });

    it('casts params like ActiveRecord', async () => {
      const res = await request(ctx.app)
        .post(`/${resource}`)
        .set(auth())
        .send({ [paramKey]: { ...validAttributes(), amount: '20.5abc', category_id: String(categoryId), date: '04/02/2021' } });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ amount: 20.5, category_id: Number(categoryId), date: '2021-02-04' });
    });

    it('does not create a record with invalid parameters and renders errors', async () => {
      const res = await request(ctx.app).post(`/${resource}`).set(auth()).send({ [paramKey]: { description: '' } });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        category: ['must exist'],
        description: ["can't be blank"],
        amount: ["can't be blank"],
        category_id: ["can't be blank"],
        user_sub: ["can't be blank"],
        title: ["can't be blank"],
        date: ["can't be blank"],
      });
      expect(Object.keys(res.body)[0]).toBe('category');
      expect(await model(ctx.prisma).count()).toBe(0);
    });

    it('requires the category to exist', async () => {
      const res = await request(ctx.app).post(`/${resource}`).set(auth()).send({ [paramKey]: { ...validAttributes(), category_id: 999 } });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ category: ['must exist'] });
    });
  });

  describe('PATCH/PUT /update', () => {
    it.each(['patch', 'put'] as const)('%s updates the record', async (method) => {
      const record = await insert();
      const res = await request(ctx.app)[method](`/${resource}/${record.id}`).set(auth()).send({ [paramKey]: { title: 'Dinner', amount: '30' } });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'Dinner', amount: 30 });
      expect(res.text).toContain('"amount":30.0');
      expect((await model(ctx.prisma).findUnique({ where: { id: record.id } }))?.title).toBe('Dinner');
    });

    it('renders errors with invalid parameters', async () => {
      const record = await insert();
      const res = await request(ctx.app).patch(`/${resource}/${record.id}`).set(auth()).send({ [paramKey]: { date: '2021-02-30' } });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ date: ["can't be blank"] });
    });
  });

  describe('DELETE /destroy', () => {
    it('destroys the record with 204', async () => {
      const record = await insert();
      const res = await request(ctx.app).delete(`/${resource}/${record.id}`).set(auth());
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await model(ctx.prisma).count()).toBe(0);
    });
  });
});
