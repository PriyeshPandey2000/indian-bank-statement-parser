import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AuthedRequest extends Request {
  userId?: string;
}

// Screenshot/export links are plain <img src>/<a href> — no Authorization header
// possible there, so those routes pass the access token as ?token= instead.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const token = headerToken || (typeof req.query.token === 'string' ? req.query.token : null);

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = data.user.id;
  next();
}
