import request from 'supertest';
import { resetDb, setup, type TestContext, USER_SUB } from './helpers';

const board = {
  goals: { 'goal-1': { id: 'goal-1', content: 'Save $1000' } },
  columns: { 'column-1': { id: 'column-1', title: 'To do', goalIds: ['goal-1'] } },
  columnOrder: ['column-1'],
};

describe('Goals', () => {
  let ctx: TestContext;
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const insert = (user_sub = USER_SUB, goals_data: object = board) => {
    const now = new Date();
    return ctx.prisma.goal.create({ data: { user_sub, goals_data, created_at: now, updated_at: now } });
  };
  beforeAll(async () => {
    ctx = await setup();
  });
  beforeEach(() => resetDb(ctx.prisma));
  afterAll(() => ctx.close());

  it("GET /index renders only the current user's goals", async () => {
    await insert();
    await insert('someone-else');
    const res = await request(ctx.app).get('/goals').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0])).toEqual(['id', 'created_at', 'updated_at', 'user_sub', 'goals_data']);
  });

  it('GET /show looks goals up by the user_sub param, not the id', async () => {
    await insert();
    const byUser = await request(ctx.app).get('/goals/999').query({ user_sub: USER_SUB }).set(auth());
    expect(byUser.status).toBe(200);
    expect(byUser.body).toHaveLength(1);
    const withoutUser = await request(ctx.app).get('/goals/1').set(auth());
    expect(withoutUser.body).toEqual([]);
  });

  it('POST /create builds goals_data from goals, columns and columnOrder', async () => {
    const res = await request(ctx.app)
      .post('/goals')
      .set(auth())
      .send({ user_sub: USER_SUB, goals_data: { ...board, ignored: true } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 1, user_sub: USER_SUB, goals_data: board });
    expect(Object.keys(res.body.goals_data)).toEqual(['goals', 'columns', 'columnOrder']);
    expect(await ctx.prisma.goal.count()).toBe(1);
  });

  it('POST /create renders errors without a user_sub', async () => {
    const res = await request(ctx.app).post('/goals').set(auth()).send({ goals_data: board });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ user_sub: ["can't be blank"] });
    expect(await ctx.prisma.goal.count()).toBe(0);
  });

  it('PATCH /update updates every goal for the user_sub and renders them', async () => {
    await insert(USER_SUB, {});
    const updated = { goals: {}, columns: {}, columnOrder: ['done'] };
    const res = await request(ctx.app).patch('/goals/999').set(auth()).send({ user_sub: USER_SUB, goals_data: updated });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].goals_data).toEqual(updated);
    expect(Object.keys(res.body[0])).toEqual(['id', 'user_sub', 'goals_data', 'created_at', 'updated_at']);
    expect((await ctx.prisma.goal.findFirst())?.goals_data).toEqual(updated);
  });

  it('PUT /update with no matching goals renders an empty list', async () => {
    const res = await request(ctx.app).put('/goals/1').set(auth()).send({ user_sub: 'nobody', goals_data: board });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('DELETE /destroy destroys the goal by id', async () => {
    const goal = await insert();
    const res = await request(ctx.app).delete(`/goals/${goal.id}`).set(auth());
    expect(res.status).toBe(204);
    expect(await ctx.prisma.goal.count()).toBe(0);
  });

  it('DELETE /destroy returns 404 for a missing goal', async () => {
    const res = await request(ctx.app).delete('/goals/999').set(auth());
    expect(res.status).toBe(404);
  });
});
