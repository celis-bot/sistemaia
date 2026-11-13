import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { validate, idParam } from '../middleware/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { pointInGeofence } from '../lib/geo.js';

const router = Router();
router.use(requireAuth);

const GEOFENCE_KINDS = ['polygon', 'circle', 'rectangle', 'marker', 'polyline'];

const geojsonSchema = z
  .object({ type: z.string().min(1) })
  .passthrough();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  kind: z.enum(GEOFENCE_KINDS).optional(),
  geojson: geojsonSchema,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color debe ser hex #RRGGBB')
    .nullish(),
});

const updateSchema = createSchema.partial();

const pingSchema = z.object({
  subject_id: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100000).optional(),
  source: z.string().max(50).optional(),
});

// Recibe un ping de ubicacion y registra enter/exit contra todas las geocercas.
// Cualquier usuario autenticado puede reportar (pensado para la app movil).
router.post('/ping', validate({ body: pingSchema }), async (req, res, next) => {
  try {
    const { subject_id, lat, lng, accuracy_m, source } = req.body;

    const { data: geos, error: gErr } = await supabaseAdmin
      .from('geofences')
      .select('id,name,kind,geojson,color');
    if (gErr) throw badRequest(gErr.message);

    const { data: presence, error: pErr } = await supabaseAdmin
      .from('geofence_presence')
      .select('geofence_id,inside')
      .eq('subject_id', subject_id);
    if (pErr) throw badRequest(pErr.message);

    const wasInside = new Map((presence || []).map((p) => [p.geofence_id, p.inside]));
    const events = [];
    const states = [];
    const now = new Date().toISOString();

    for (const gf of geos || []) {
      const isInside = pointInGeofence(gf.geojson, lat, lng, accuracy_m ?? 0);
      const hadInside = wasInside.get(gf.id) === true;
      states.push({ id: gf.id, name: gf.name, kind: gf.kind, color: gf.color, inside: isInside });

      if (isInside !== hadInside) {
        events.push({
          geofence_id: gf.id,
          subject_id,
          event: isInside ? 'enter' : 'exit',
          lat,
          lng,
          accuracy_m: accuracy_m ?? null,
          source: source ?? null,
        });
      }

      // Solo persistimos presencia cuando es relevante (dentro o lo estuvo):
      // evita una fila por cada geocerca en cada ping.
      if (isInside || hadInside) {
        await supabaseAdmin.from('geofence_presence').upsert(
          {
            subject_id,
            geofence_id: gf.id,
            inside: isInside,
            last_lat: lat,
            last_lng: lng,
            last_seen_at: now,
          },
          { onConflict: 'subject_id,geofence_id' }
        );
      }
    }

    if (events.length) {
      const { error: evErr } = await supabaseAdmin.from('geofence_events').insert(events);
      if (evErr) throw badRequest(evErr.message);
    }

    res.json({
      subject_id,
      lat,
      lng,
      inside_ids: states.filter((s) => s.inside).map((s) => s.id),
      geofences: states,
      new_events: events.map((e) => ({ ...e, event: e.event })),
    });
  } catch (e) { next(e); }
});

// Lista todas las geocercas (cualquier usuario autenticado)
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('geofences')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw badRequest(error.message);
    res.json({ geofences: data, count: data.length });
  } catch (e) { next(e); }
});

// Crea una geocerca (admin/docente)
router.post('/', requireRole('admin', 'docente'), validate({ body: createSchema }), async (req, res, next) => {
  try {
    const { name, description, kind, geojson, color } = req.body;
    const row = {
      name,
      description: description ?? null,
      kind: kind ?? 'polygon',
      geojson,
      color: color ?? null,
      created_by: req.user?.id ?? null,
    };
    const { data, error } = await supabaseAdmin
      .from('geofences')
      .insert(row)
      .select()
      .single();
    if (error) throw badRequest(error.message);
    res.status(201).json({ geofence: data });
  } catch (e) { next(e); }
});

// Obtiene una geocerca
router.get('/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('geofences')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw notFound('Geocerca no encontrada');
    res.json({ geofence: data });
  } catch (e) { next(e); }
});

// Actualiza una geocerca (admin/docente)
router.patch('/:id', requireRole('admin', 'docente'), validate({ params: idParam, body: updateSchema }), async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('geofences')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw notFound('Geocerca no encontrada');
    res.json({ geofence: data });
  } catch (e) { next(e); }
});

// Elimina una geocerca (admin/docente)
router.delete('/:id', requireRole('admin', 'docente'), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('geofences')
      .delete()
      .eq('id', req.params.id);
    if (error) throw badRequest(error.message);
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

export default router;
