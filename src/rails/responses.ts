import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

// ActionDispatch default response headers added to controller-rendered responses.
export const RAILS_DEFAULT_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'X-Content-Type-Options': 'nosniff',
  'X-Download-Options': 'noopen',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

const JSON_TYPES = new Set(['application/json', 'text/x-json', 'application/jsonrequest']);
const XML_TYPES = new Set(['application/xml', 'text/xml', 'application/x-xml']);
// Other MIME types Rails registers by default; unregistered types are skipped during negotiation.
const OTHER_REGISTERED_TYPES = new Set([
  '*/*', 'text/html', 'application/xhtml+xml', 'text/plain', 'text/javascript', 'application/javascript',
  'application/x-javascript', 'text/css', 'text/calendar', 'text/csv', 'text/vcard', 'text/vtt',
  'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml', 'video/mpeg',
  'audio/mpeg', 'audio/ogg', 'audio/aac', 'video/webm', 'video/mp4', 'font/otf', 'font/ttf', 'font/woff',
  'font/woff2', 'application/rss+xml', 'application/atom+xml', 'application/x-yaml', 'text/yaml',
  'multipart/form-data', 'application/x-www-form-urlencoded', 'application/pdf', 'application/zip',
  'application/gzip',
]);
const BROWSER_LIKE_ACCEPTS = /,\s*\*\/\*|\*\/\*\s*,/;

type Format = 'json' | 'xml' | 'other';

function formatFromExtension(ext: string): Format {
  const e = ext.toLowerCase();
  return e === 'json' ? 'json' : e === 'xml' ? 'xml' : 'other';
}

function formatFromMime(mime: string): Format | null {
  const m = mime.trim().toLowerCase();
  if (JSON_TYPES.has(m)) return 'json';
  if (XML_TYPES.has(m)) return 'xml';
  return OTHER_REGISTERED_TYPES.has(m) ? 'other' : null;
}

// ActionDispatch::Http::MimeNegotiation#formats
function negotiateFormat(req: Request): Format {
  const paramFormat = req.params?.format ?? (req.query?.format as unknown);
  if (typeof paramFormat === 'string' && paramFormat) return formatFromExtension(paramFormat);

  const accept = (req.get('accept') ?? '').trim();
  const xhr = /XMLHttpRequest/i.test(req.get('x-requested-with') ?? '');
  const contentType = req.get('content-type')?.split(';')[0];
  if ((xhr && (accept || contentType)) || (accept && !BROWSER_LIKE_ACCEPTS.test(accept))) {
    if (!accept) return formatFromMime(contentType ?? '') ?? 'other';
    const items = accept
      .split(',')
      .map((part, index) => {
        const [type, ...rest] = part.split(/\s*;\s*/);
        const q = rest.find((p) => p.startsWith('q='));
        return { type: type.trim(), q: q ? parseFloat(q.slice(2)) : 1, index };
      })
      .filter((i) => i.type)
      .sort((a, b) => b.q - a.q || a.index - b.index);
    for (const item of items) {
      const format = formatFromMime(item.type);
      if (format) return format;
    }
    return 'other';
  }

  const ext = /\.(\w+)$/.exec(req.originalUrl);
  if (ext) return formatFromExtension(ext[1]);
  return 'other';
}

function toXml(body: { status: number; error: string }): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<hash>\n' +
    `  <status type="integer">${body.status}</status>\n  <error>${body.error}</error>\n</hash>\n`
  );
}

function sendRaw(res: Response, status: number, contentType: string, payload: string) {
  res.status(status);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
}

// Mirrors ActionDispatch::ShowExceptions + PublicExceptions in production for an API-only app:
// JSON/XML body when the client negotiated that format, otherwise an empty text/html response.
export function renderRailsError(req: Request, res: Response, status: number): void {
  const body = { status, error: STATUS_TEXT[status] ?? STATUS_TEXT[500] };
  for (const header of [...Object.keys(RAILS_DEFAULT_HEADERS), 'ETag', 'Cache-Control']) res.removeHeader(header);
  switch (negotiateFormat(req)) {
    case 'json':
      return sendRaw(res, status, 'application/json; charset=UTF-8', JSON.stringify(body));
    case 'xml':
      return sendRaw(res, status, 'application/xml; charset=UTF-8', toXml(body));
    default:
      return sendRaw(res, status, 'text/html; charset=UTF-8', '');
  }
}

// ActiveSupport::JSON escapes HTML-significant characters and line/paragraph separators.
const JSON_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const FLOAT_TOKEN = randomUUID();
const FLOAT_PATTERN = new RegExp(`"${FLOAT_TOKEN}([^"]*)"`, 'g');

// Wraps a Float attribute so it is encoded like Ruby's Float#to_s (12.0, 1.0e+16) instead of JS's (12, 10000000000000000).
export class RubyFloat {
  constructor(readonly value: number) {}
}

export function rubyFloatToS(x: number): string | null {
  if (!Number.isFinite(x)) return null;
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const [mantissa, exponent] = Math.abs(x).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const e = Number(exponent);
  const decpt = e + 1;
  let s: string;
  if (decpt > 0 && decpt <= 16) {
    s = digits.length <= decpt ? `${digits}${'0'.repeat(decpt - digits.length)}.0` : `${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
  } else if (decpt <= 0 && decpt > -4) {
    s = `0.${'0'.repeat(-decpt)}${digits}`;
  } else {
    s = `${digits[0]}.${digits.slice(1) || '0'}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  return (x < 0 ? '-' : '') + s;
}

function encodeJson(body: unknown): string {
  const json = JSON.stringify(body, (_key, value) => (value instanceof RubyFloat ? FLOAT_TOKEN + (rubyFloatToS(value.value) ?? 'null') : value));
  return json.replace(FLOAT_PATTERN, (_m, text: string) => text);
}

// `render json: ...`
export function renderJson(res: Response, status: number, body: unknown): void {
  const payload = encodeJson(body).replace(/[<>&\u2028\u2029]/g, (c) => JSON_ESCAPES[c]);
  res.status(status);
  if (status === 200 || status === 201) res.setHeader('Cache-Control', 'max-age=0, private, must-revalidate');
  res.type('application/json; charset=utf-8').send(payload);
}

// `head :no_content`
export function headNoContent(res: Response): void {
  res.status(204).end();
}

// url_for(record), honouring X-Forwarded-Proto/Host like Rack does.
export function recordUrl(req: Request, path: string): string {
  const proto = (req.get('x-forwarded-proto')?.split(',')[0].trim() || req.protocol || 'http').toLowerCase();
  const forwardedHost = req.get('x-forwarded-host')?.split(/,\s?/).pop()?.trim();
  let host = forwardedHost || req.get('host') || 'localhost';
  if ((proto === 'http' && host.endsWith(':80')) || (proto === 'https' && host.endsWith(':443'))) {
    host = host.replace(/:\d+$/, '');
  }
  return `${proto}://${host}${path}`;
}
