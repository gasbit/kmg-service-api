import type { AuthUser } from "../shared/types/auth-user.type";

declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: AuthUser;
    }
  }
}
