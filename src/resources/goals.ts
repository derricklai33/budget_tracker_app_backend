import type { Goal, Prisma, PrismaClient } from '@prisma/client';
import { castString, isBlank, isPlainObject, type Params, rubyInspect } from '../rails/casting';
import { railsParams, RecordNotFound } from '../rails/params';
import { headNoContent, recordUrl, renderJson } from '../rails/responses';
import { type Columns, parseId, serialize } from './records';
import type { ResourceActions } from './router';

const GOAL_COLUMNS: Columns = [
  ['id', 'id'],
  ['created_at', 'timestamp'],
  ['updated_at', 'timestamp'],
  ['user_sub', 'string'],
  ['goals_data', 'json'],
];

const render = (goal: Goal) => serialize(goal, GOAL_COLUMNS);

// `params['goals_data'][key]` with Ruby semantics: Hash lookup, String#[] substring match,
// anything else (nil, Array, Integer, ...) raises -> 500.
function goalsData(params: Params): Prisma.InputJsonObject {
  const source = params.goals_data;
  const lookup = (key: string): Prisma.InputJsonValue | null => {
    if (isPlainObject(source)) return (source[key] ?? null) as Prisma.InputJsonValue | null;
    if (typeof source === 'string') return source.includes(key) ? key : null;
    throw new TypeError(`undefined method '[]' for ${rubyInspect(source)}`);
  };
  return { goals: lookup('goals'), columns: lookup('columns'), columnOrder: lookup('columnOrder') };
}

// Goal.where(user_sub: params['user_sub'])
async function goalsForUserSub(prisma: PrismaClient, raw: unknown): Promise<Goal[]> {
  if (raw === null || raw === undefined) return [];
  if (isPlainObject(raw)) throw new TypeError('unsupported where condition for user_sub');
  if (Array.isArray(raw)) {
    const values = raw.map(castString).filter((v): v is string => v !== null);
    return prisma.goal.findMany({ where: { user_sub: { in: values } } });
  }
  return prisma.goal.findMany({ where: { user_sub: castString(raw)! } });
}

// Ruby == for JSON values: Hash equality ignores key order.
function rubyEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => rubyEqual(v, b[i]));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && rubyEqual(a[k], b[k]));
  }
  return a === b;
}

// GoalsController: show/update operate on every goal matching params['user_sub'] (not the :id),
// so the frontend can move goals between board columns without a refresh.
export function goalsActions(prisma: PrismaClient): ResourceActions {
  return {
    index: async (req, res) => {
      const goals = req.currentUser == null ? [] : await prisma.goal.findMany({ where: { user_sub: req.currentUser } });
      renderJson(res, 200, goals.map(render));
    },

    show: async (req, res) => {
      const goals = await goalsForUserSub(prisma, railsParams(req).user_sub);
      renderJson(res, 200, goals.map(render));
    },

    create: async (req, res) => {
      const params = railsParams(req);
      const userSub = castString(params.user_sub);
      const data = goalsData(params);
      if (isBlank(userSub)) return renderJson(res, 422, { user_sub: ["can't be blank"] });
      const now = new Date();
      const goal = await prisma.goal.create({
        data: { user_sub: userSub!, goals_data: data, created_at: now, updated_at: now },
      });
      res.setHeader('Location', recordUrl(req, `/goals/${goal.id}`));
      renderJson(res, 201, render(goal));
    },

    // Relation#update: each matching record is assigned the new attributes and saved if valid
    // (invalid ones are skipped silently); the in-memory records are rendered with 200 regardless.
    update: async (req, res) => {
      const params = railsParams(req);
      const userSub = castString(params.user_sub);
      const data = goalsData(params);
      const goals = await goalsForUserSub(prisma, params.user_sub);
      const rendered = [];
      for (const goal of goals) {
        let current: Goal = { ...goal, user_sub: userSub!, goals_data: data as Prisma.JsonValue };
        if (!isBlank(userSub) && (goal.user_sub !== userSub || !rubyEqual(goal.goals_data, data))) {
          current = await prisma.goal.update({
            where: { id: goal.id },
            data: { user_sub: userSub!, goals_data: data, updated_at: new Date() },
          });
        }
        rendered.push(serialize(current, GOAL_COLUMNS, ['id', 'user_sub', 'goals_data']));
      }
      renderJson(res, 200, rendered);
    },

    // Goal.destroy(params['id'])
    destroy: async (req, res) => {
      const id = parseId(req.params.id);
      const goal = await prisma.goal.findUnique({ where: { id } });
      if (!goal) throw new RecordNotFound();
      await prisma.goal.delete({ where: { id } });
      headNoContent(res);
    },
  };
}
