import { Router } from 'express';
import { z } from 'zod';
import { supabasePublic, supabaseAdmin } from '../services/supabase.js';
import { body as validateBody } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { hashPassword, comparePassword } from '../lib/passwords.js';
import { signLocalToken } from '../lib/jwt.js';
import env from '../config/env.js';
import { badRequest, unauthorized } from '../lib/errors.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Minimo 8 caracteres'),
  full_name: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Registro: modo local (app_users + bcrypt) o Supabase Auth
router.post('/signup', authLimiter, validateBody(signupSchema), async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;

    if (env.LOCAL_AUTH_ENABLED) {
      const password_hash = await hashPassword(password);
      const { data: user, error } = await supabaseAdmin
        .from('app_users')
        .insert({ email, password_hash, role: 'viewer' })
        .select('id, email, role')
        .single();
      if (error) {
        if (error.code === '23505') throw badRequest('El correo ya esta registrado');
        throw badRequest(error.message);
      }
      const token = signLocalToken({ sub: user.id, email: user.email, role: user.role });
      return res.status(201).json({ user, token, mode: 'local' });
    }

    const { data, error } = await supabasePublic.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (error) throw badRequest(error.message);
    res.status(201).json({ user: data.user, session: data.session });
  } catch (e) { next(e); }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Modo local opcional: usuarios en tabla app_users con bcrypt
    if (env.LOCAL_AUTH_ENABLED) {
      const { data: user, error } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (error) throw badRequest(error.message);
      if (!user || !(await comparePassword(password, user.password_hash))) {
        throw unauthorized('Credenciales invalidas');
      }
      const token = signLocalToken({ sub: user.id, email: user.email, role: user.role });
      return res.json({ user: { id: user.id, email: user.email, role: user.role }, token, mode: 'local' });
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });
    if (error) throw unauthorized('Credenciales invalidas');
    res.json({ user: data.user, session: data.session });
  } catch (e) { next(e); }
});

// Utilidad admin: crear usuario con hash bcrypt explicito (endpoint protegido por service role)
router.post('/users', authLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(['admin', 'docente', 'viewer']).default('viewer'),
    });
    const { email, password, role } = schema.parse(req.body);
    const password_hash = await hashPassword(password);
    const { data, error } = await supabaseAdmin
      .from('app_users')
      .insert({ email, password_hash, role })
      .select('id, email, role')
      .single();
    if (error) throw badRequest(error.message);
    res.status(201).json(data);
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res) => {
  res.json({ ok: true });
});

export default router;
