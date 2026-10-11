import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import { castString } from '../rails/casting';
import { permit, railsParams, RecordNotFound, requireParam } from '../rails/params';
import { headNoContent, recordUrl, renderJson } from '../rails/responses';
import {
  addPresenceErrors,
  castAttribute,
  type Columns,
  type ColumnType,
  dateFromDb,
  dateToDb,
  parseId,
  type Row,
  serialize,
  type ValidationErrors,
} from './records';
import type { ResourceActions } from './router';

interface Delegate {
  findMany(args?: { where?: Row }): Promise<Row[]>;
  findUnique(args: { where: { id: bigint } }): Promise<Row | null>;
  create(args: { data: Row }): Promise<Row>;
  update(args: { where: { id: bigint }; data: Row }): Promise<Row>;
  delete(args: { where: { id: bigint } }): Promise<Row>;
}

export interface CrudSpec {
  /** URL segment, e.g. `expenses`. */
  name: string;
  /** Key passed to `params.require`, e.g. `expense`. */
  paramKey: string;
  columns: Columns;
  permitted: readonly string[];
  /** validates_presence_of attributes, in declaration order. */
  presence: readonly string[];
  /** `belongs_to :category` (required by default since Rails 5). */
  belongsToCategory: boolean;
  /** `index` returns only records where user_sub = current user. */
  userScopedIndex: boolean;
  delegate: (prisma: PrismaClient) => Delegate;
}

// Standard scaffolded Rails controller (find by id, require/permit, 201/422/204).
export function crudActions(prisma: PrismaClient, spec: CrudSpec): ResourceActions {
  const model = spec.delegate(prisma);
  const types = new Map<string, ColumnType>(spec.columns);

  const toAttributes = (row: Row): Row =>
    Object.fromEntries(spec.columns.map(([name, type]) => [name, type === 'date' ? dateFromDb(row[name] as Date | null) : row[name]]));

  const toDb = (attrs: Row): Row =>
    Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, types.get(k) === 'date' ? dateToDb(v as string | null) : v]));

  const castParams = (raw: Row): Row =>
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, castAttribute(types.get(k)!, v)]));

  const permittedAttributes = (req: Parameters<RequestHandler>[0]) =>
    castParams(permit(requireParam(railsParams(req), spec.paramKey), spec.permitted));

  async function validate(record: Row): Promise<ValidationErrors | null> {
    const errors: ValidationErrors = {};
    if (spec.belongsToCategory) {
      const categoryId = record.category_id as bigint | null;
      const category = categoryId === null ? null : await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) errors.category = ['must exist'];
    }
    addPresenceErrors(errors, record, spec.presence);
    return Object.keys(errors).length ? errors : null;
  }

  async function find(rawId: unknown): Promise<Row> {
    const row = await model.findUnique({ where: { id: parseId(rawId) } });
    if (!row) throw new RecordNotFound();
    return row;
  }

  const location = (req: Parameters<RequestHandler>[0], row: Row) => recordUrl(req, `/${spec.name}/${row.id}`);

  return {
    index: async (req, res) => {
      let rows: Row[];
      if (!spec.userScopedIndex) rows = await model.findMany();
      else if (req.currentUser == null) rows = [];
      else rows = await model.findMany({ where: { user_sub: castString(req.currentUser) } });
      renderJson(res, 200, rows.map((row) => serialize(row, spec.columns)));
    },

    show: async (req, res) => {
      renderJson(res, 200, serialize(await find(req.params.id), spec.columns));
    },

    create: async (req, res) => {
      const attrs = permittedAttributes(req);
      const blank = Object.fromEntries(spec.columns.map(([name]) => [name, null]));
      const errors = await validate({ ...blank, ...attrs });
      if (errors) return renderJson(res, 422, errors);
      const now = new Date();
      const row = await model.create({ data: { ...toDb(attrs), created_at: now, updated_at: now } });
      res.setHeader('Location', location(req, row));
      renderJson(res, 201, serialize(row, spec.columns));
    },

    update: async (req, res) => {
      let row = await find(req.params.id);
      const attrs = permittedAttributes(req);
      const current = toAttributes(row);
      const errors = await validate({ ...current, ...attrs });
      if (errors) return renderJson(res, 422, errors);
      const changed = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => current[k] !== v));
      if (Object.keys(changed).length) {
        row = await model.update({ where: { id: row.id as bigint }, data: { ...toDb(changed), updated_at: new Date() } });
      }
      const touched = ['id', ...Object.keys(attrs), ...(spec.belongsToCategory ? ['category_id'] : []), ...spec.presence];
      renderJson(res, 200, serialize(row, spec.columns, touched));
    },

    destroy: async (req, res) => {
      const row = await find(req.params.id);
      await model.delete({ where: { id: row.id as bigint } });
      headNoContent(res);
    },
  };
}

const LEDGER_COLUMNS: Columns = [
  ['id', 'id'],
  ['description', 'string'],
  ['amount', 'float'],
  ['category_id', 'integer'],
  ['created_at', 'timestamp'],
  ['updated_at', 'timestamp'],
  ['user_sub', 'string'],
  ['title', 'string'],
  ['date', 'date'],
];
const LEDGER_PARAMS = ['description', 'amount', 'user_sub', 'category_id', 'title', 'date'] as const;
const LEDGER_PRESENCE = ['description', 'amount', 'category_id', 'user_sub', 'title', 'date'] as const;

export const categoriesSpec: CrudSpec = {
  name: 'categories',
  paramKey: 'category',
  columns: [
    ['id', 'id'],
    ['description', 'string'],
    ['created_at', 'timestamp'],
    ['updated_at', 'timestamp'],
  ],
  permitted: ['description'],
  presence: ['description'],
  belongsToCategory: false,
  userScopedIndex: false,
  delegate: (prisma) => prisma.category as unknown as Delegate,
};

export const expensesSpec: CrudSpec = {
  name: 'expenses',
  paramKey: 'expense',
  columns: LEDGER_COLUMNS,
  permitted: LEDGER_PARAMS,
  presence: LEDGER_PRESENCE,
  belongsToCategory: true,
  userScopedIndex: true,
  delegate: (prisma) => prisma.expense as unknown as Delegate,
};

export const incomesSpec: CrudSpec = {
  ...expensesSpec,
  name: 'incomes',
  paramKey: 'income',
  delegate: (prisma) => prisma.income as unknown as Delegate,
};

export const sharesSpec: CrudSpec = {
  name: 'shares',
  paramKey: 'share',
  columns: [
    ['id', 'id'],
    ['description', 'string'],
    ['symbol', 'string'],
    ['user_sub', 'string'],
    ['created_at', 'timestamp'],
    ['updated_at', 'timestamp'],
  ],
  permitted: ['description', 'symbol', 'user_sub'],
  presence: ['description', 'symbol', 'user_sub'],
  belongsToCategory: false,
  userScopedIndex: true,
  delegate: (prisma) => prisma.share as unknown as Delegate,
};
