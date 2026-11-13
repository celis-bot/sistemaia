import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'docente'));

const listQuery = z.object({
  geofence_id: z.string().uuid().optional(),
  subject_id: z.string().optional(),
  event: z.enum(['enter', 'exit']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// Lista eventos enter/exit (mas recientes primero)
router.get('/', validate({ query: listQuery }), async (req, res, next) => {
  try {
    const { geofence_id, subject_id, event, limit } = req.query;
    let q = supabaseAdmin
      .from('geofence_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (geofence_id) q = q.eq('geofence_id', geofence_id);
    if (subject_id) q = q.eq('subject_id', subject_id);
    if (event) q = q.eq('event', event);

    const { data, error } = await q;
    if (error) throw badRequest(error.message);
    res.json({ events: data, count: data.length });
  } catch (e) { next(e); }
});

// Quien esta dentro de cada geocerca ahora mismo
router.get('/presence', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('geofence_presence')
      .select('*')
      .eq('inside', true)
      .order('last_seen_at', { ascending: false });
    if (error) throw badRequest(error.message);
    res.json({ presence: data, count: data.length });
  } catch (e) { next(e); }
});

export default router;
