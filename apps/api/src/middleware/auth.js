import { supabasePublic } from '../services/supabase.js';
import { verifyLocalToken } from '../lib/jwt.js';
import env from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

// Verifica el JWT (local HS256 o Supabase) y adjunta req.user
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Falta token de autenticacion'));

  if (env.LOCAL_AUTH_ENABLED) {
    const local = verifyLocalToken(token);
    if (local) {
      req.user = {
        id: local.sub,
        email: local.email,
        app_metadata: { role: local.role || 'viewer' },
        user_metadata: {},
      };
      return next();
    }
  }

  const { data, error } = await supabasePublic.auth.getUser(token);
  if (error || !data?.user) return next(unauthorized('Token invalido o expirado'));

  req.user = data.user;
  next();
}

// Rol minimo requerido (lee de app_metadata.role o user_metadata.role)
export function requireRole(...roles) {
  return (req, _res, next) => {
    const role = req.user?.app_metadata?.role || req.user?.user_metadata?.role || 'user';
    if (!roles.includes(role)) return next(unauthorized('Rol insuficiente'));
    next();
  };
}
