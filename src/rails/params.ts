import type { Request } from 'express';
import { isBlank, isPlainObject, type Params } from './casting';

export class ParameterMissing extends Error {
  constructor(key: string) {
    super(`param is missing or the value is empty: ${key}`);
  }
}

export class RecordNotFound extends Error {}

// ActionDispatch deep_munge: nils are removed from arrays.
export function deepMunge(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((v) => v !== null).map(deepMunge);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepMunge(v)]));
  }
  return value;
}

// Equivalent of the controller's `params`: request body, then query string, then path params.
export function railsParams(req: Request): Params {
  let body: unknown = req.body ?? {};
  if (!isPlainObject(body)) body = { _json: body };
  const query = isPlainObject(req.query) ? req.query : {};
  const path = Object.fromEntries(Object.entries(req.params).filter(([, v]) => v !== undefined));
  return { ...(deepMunge(body) as Params), ...(deepMunge(query) as Params), ...path };
}

// params.require(key)
export function requireParam(params: Params, key: string): Params {
  const value = params[key];
  if (value !== false && isBlank(value)) throw new ParameterMissing(key);
  if (!isPlainObject(value)) throw new TypeError(`undefined method 'permit' for ${typeof value}`);
  return value;
}

const isPermittedScalar = (v: unknown) =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

// .permit(*keys) for scalar keys: non-scalar values are dropped, absent keys stay absent.
export function permit(params: Params, keys: readonly string[]): Params {
  const out: Params = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(params, key) && isPermittedScalar(params[key])) {
      out[key] = params[key];
    }
  }
  return out;
}
