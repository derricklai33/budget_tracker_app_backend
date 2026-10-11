import { castDate, castFloat, castInteger, castString, inInt64Range, isBlank, rubyToI } from '../rails/casting';
import { RecordNotFound } from '../rails/params';
import { RubyFloat } from '../rails/responses';

export type ColumnType = 'id' | 'string' | 'float' | 'integer' | 'date' | 'timestamp' | 'json';
export type Columns = ReadonlyArray<readonly [string, ColumnType]>;
export type Row = Record<string, unknown>;
export type ValidationErrors = Record<string, string[]>;

// as_json of an ActiveRecord model: every column, in table order. ActiveRecord materializes
// attributes lazily, so attributes touched before serialization (written, then validated)
// come first; `touched` reproduces that order.
export function serialize(row: Row, columns: Columns, touched: readonly string[] = []): Row {
  const types = new Map<string, ColumnType>(columns);
  const names = [...new Set([...touched, ...columns.map(([name]) => name)])];
  const out: Row = {};
  for (const name of names) {
    const type = types.get(name)!;
    const value = row[name];
    if (value === null || value === undefined) out[name] = null;
    else if (type === 'id' || type === 'integer') out[name] = Number(value as bigint);
    else if (type === 'timestamp') out[name] = (value as Date).toISOString();
    else if (type === 'date') out[name] = (value as Date).toISOString().slice(0, 10);
    else if (type === 'float') out[name] = new RubyFloat(value as number);
    else out[name] = value;
  }
  return out;
}

export function castAttribute(type: ColumnType, value: unknown): unknown {
  switch (type) {
    case 'string':
      return castString(value);
    case 'float':
      return castFloat(value);
    case 'integer': {
      const int = castInteger(value);
      if (int !== null && !inInt64Range(int)) throw new RangeError(`${int} is out of range for bigint`);
      return int;
    }
    case 'date':
      return castDate(value);
    default:
      return value;
  }
}

// Model.find(params[:id])
export function parseId(raw: unknown): bigint {
  const id = typeof raw === 'string' ? rubyToI(raw) : null;
  if (id === null || !inInt64Range(id)) throw new RecordNotFound();
  return id;
}

export function addPresenceErrors(errors: ValidationErrors, record: Row, attributes: readonly string[]) {
  for (const attribute of attributes) {
    if (isBlank(record[attribute])) (errors[attribute] ??= []).push("can't be blank");
  }
}

export const dateToDb = (iso: string | null) => (iso === null ? null : new Date(`${iso}T00:00:00.000Z`));
export const dateFromDb = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));
