// Ports of the ActiveModel type casts / Ruby coercions the Rails API relied on,
// so request values are stored exactly as ActiveRecord would have stored them.

export type Params = Record<string, unknown>;

export const isPlainObject = (value: unknown): value is Params =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Object#blank?
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') return /^\s*$/.test(value);
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function rubyInspect(value: unknown): string {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(rubyInspect).join(', ')}]`;
  if (isPlainObject(value)) {
    return `{${Object.entries(value)
      .map(([k, v]) => `${JSON.stringify(k)}=>${rubyInspect(v)}`)
      .join(', ')}}`;
  }
  return String(value);
}

// String#to_i
export function rubyToI(value: string): bigint {
  const match = /^\s*([+-]?\d+(?:_\d+)*)/.exec(value);
  return match ? BigInt(match[1].replace(/_/g, '')) : 0n;
}

// String#to_f
export function rubyToF(value: string): number {
  const match = /^\s*([+-]?(?:\d+(?:_\d+)*)?(?:\.\d+(?:_\d+)*)?(?:[eE][+-]?\d+)?)/.exec(value);
  const numeric = match ? match[1].replace(/_/g, '') : '';
  return /\d/.test(numeric) ? parseFloat(numeric) : 0;
}

export const INT64_MIN = -(2n ** 63n);
export const INT64_MAX = 2n ** 63n - 1n;
export const inInt64Range = (value: bigint): boolean => value >= INT64_MIN && value <= INT64_MAX;

// ActiveModel::Type::String
export function castString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value === true) return 't';
  if (value === false) return 'f';
  if (typeof value === 'number') return String(value);
  return rubyInspect(value);
}

// ActiveModel::Type::Float
export function castFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (isBlank(value)) return null;
    if (value === 'Infinity') return Infinity;
    if (value === '-Infinity') return -Infinity;
    if (value === 'NaN') return NaN;
    return rubyToF(value);
  }
  throw new TypeError(`cannot cast ${rubyInspect(value)} to float`);
}

// ActiveModel::Type::Integer (bigint columns)
export function castInteger(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  if (value === true) return 1n;
  if (value === false) return 0n;
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(Math.trunc(value)) : null;
  if (typeof value === 'string') return isBlank(value) ? null : rubyToI(value);
  throw new TypeError(`cannot cast ${rubyInspect(value)} to integer`);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = MONTHS.join('|');

function newDate(year: number | null, mon: number | null, mday: number | null): string | null {
  if (year === null || mon === null || mday === null) return null;
  if (year === 0 && mon === 0 && mday === 0) return null;
  if (year < 1 || year > 9999 || mon < 1 || mon > 12 || mday < 1) return null;
  const date = new Date(Date.UTC(2000, mon - 1, mday));
  date.setUTCFullYear(year);
  if (date.getUTCMonth() !== mon - 1 || date.getUTCDate() !== mday) return null;
  return `${String(year).padStart(4, '0')}-${String(mon).padStart(2, '0')}-${String(mday).padStart(2, '0')}`;
}

// Date._parse's s3e() heuristic for ordering ambiguous y/m/d triples.
function s3e(y: string | null, m: string | null, d: string | null): [number | null, number | null, number | null] {
  if (y !== null && m !== null && d === null) [y, m, d] = [d, y, m];
  if (y === null && d !== null && (d.length > 2 || d.startsWith("'"))) [y, d] = [d, null];
  if (y !== null && y.replace(/^[^\d+-]*/, '').replace(/^[+-]?\d*/, '') !== '') [y, d] = [d, y];
  if (m !== null && (m.startsWith("'") || m.length > 2)) [y, m, d] = [m, d, y];
  if (d !== null && (d.startsWith("'") || d.length > 2)) [y, d] = [d, y];
  const num = (s: string | null) => (s === null ? null : parseInt(s.replace(/^'/, '').replace(/[^\d-]/g, ''), 10));
  return [num(y), num(m), num(d)];
}

// Subset of Date._parse(string, false) covering the formats a client can send:
// ISO (2021-02-06, 2021-02-06T13:00:00Z), dd/mm/yyyy, dd.mm.yyyy, yyyymmdd,
// "6 Feb 2021", "Feb 6, 2021".
function rubyDateParse(input: string): string | null {
  const s = input.toLowerCase();
  let match: RegExpExecArray | null;
  if ((match = new RegExp(`'?\\b(\\d+)[^-\\d\\s']*\\s*(${MONTH_RE})[^-\\d\\s']*(?:\\s*('?-?\\d+))?`).exec(s))) {
    const [y, , d] = s3e(match[3] ?? null, String(MONTHS.indexOf(match[2]) + 1), match[1]);
    return newDate(y, MONTHS.indexOf(match[2]) + 1, d);
  }
  if ((match = new RegExp(`\\b(${MONTH_RE})[^-\\d\\s']*\\s*('?\\d+)[^-\\d\\s']*(?:\\s*,?\\s*('?-?\\d+))?`).exec(s))) {
    const [y, , d] = s3e(match[3] ?? null, String(MONTHS.indexOf(match[1]) + 1), match[2]);
    return newDate(y, MONTHS.indexOf(match[1]) + 1, d);
  }
  if ((match = /('?[-+]?\d+)-(\d+)-('?-?\d+)/.exec(s))) return newDate(...s3e(match[1], match[2], match[3]));
  if ((match = /('?-?\d+)\/\s*('?\d+)(?:\D\s*('?-?\d+))?/.exec(s))) {
    return newDate(...s3e(match[1], match[2], match[3] ?? null));
  }
  if ((match = /('?-?\d+)\.\s*('?\d+)\.\s*('?-?\d+)/.exec(s))) return newDate(...s3e(match[1], match[2], match[3]));
  if ((match = /^\s*(\d{4})(\d{2})(\d{2})\s*$/.exec(s))) {
    return newDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  return null;
}

// ActiveModel::Type::Date. Returns an ISO "YYYY-MM-DD" string.
export function castDate(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  const iso = /^(\d{4})-(\d\d)-(\d\d)$/.exec(value);
  if (iso) return newDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return rubyDateParse(value);
}
