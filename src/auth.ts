import type { Request, RequestHandler } from 'express';
import { expressjwt, UnauthorizedError, type GetVerificationKey } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import type { AuthConfig } from './config';
import { castString } from './rails/casting';

// AuthorizationService#http_token: last whitespace-separated segment of the Authorization header.
export function tokenFromHeader(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.trim()) return undefined;
  return header.trim().split(/\s+/).pop();
}

// Errors the Rails app rescued as JWT::DecodeError / JWT::VerificationError
// (bad/expired token, wrong iss/aud/alg, unknown kid, empty JWKS).
function isAuthenticationError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) return true;
  const e = err as { name?: string; message?: string };
  if (e?.name === 'SigningKeyNotFoundError') return true;
  return e?.name === 'JwksError' && /did not contain any (signing )?keys/.test(e.message ?? '');
}

// JsonWebToken.verify + SecuredController#authorize_request.
export function createAuthenticate(config: AuthConfig): RequestHandler {
  const jwks = jwksRsa({ jwksUri: `${config.domain}.well-known/jwks.json`, cache: true });

  const secret: GetVerificationKey = async (_req, token) => {
    const kid = token?.header.kid;
    if (!kid) throw new UnauthorizedError('invalid_token', { message: 'No verification key available' });
    const key = await jwks.getSigningKey(kid);
    return key.getPublicKey();
  };

  const verify = expressjwt({
    secret,
    algorithms: ['RS256'],
    issuer: config.domain,
    audience: config.apiIdentifier,
    getToken: tokenFromHeader,
  });

  return (req, res, next) => {
    verify(req, res, (err?: unknown) => {
      if (err) {
        if (isAuthenticationError(err)) {
          res.status(401).json({ errors: ['Not Authenticated'] });
          return;
        }
        next(err);
        return;
      }
      req.currentUser = castString(req.auth?.sub);
      next();
    });
  };
}
