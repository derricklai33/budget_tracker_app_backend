import type { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
      currentUser?: string | null;
    }
  }
}

export {};
