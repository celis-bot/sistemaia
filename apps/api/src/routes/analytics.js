import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { computePerformance } from '../services/weighting.js';
import { badRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'docente'));

// Ponderacion de desempeno por estudiante
// Une task_deliveries (Teams) + attendance_records (Conecta UACJ)
router.get('/performance', async (req, res, next) => {
  try {
    const { period, limit = 500 } = req.query;

    let q = supabaseAdmin
      .from('student_performance')
      .select('*')
      .order('score', { ascending: false })
      .limit(Number(limit));
    if (period) q = q.eq('period', period);

    const { data, error } = await q;
    if (error) throw badRequest(error.message);
    res.json({ students: data, count: data.length });
  } catch (e) { next(e); }
});

// Recalcula ponderaciones a partir de las tablas base y guarda en student_performance
router.post('/performance/recalculate', async (req, res, next) => {
  try {
    const { period } = req.body || {};

    // Entregas agrupadas por alumno
    let dq = supabaseAdmin
      .from('task_deliveries')
      .select('student_name,total_tasks,delivered_tasks,on_time_tasks,tasks_score,punctuality_score');
    const { data: deliveries, error: dErr } = await dq;
    if (dErr) throw badRequest(dErr.message);

    // Inasistencias agrupadas por alumno (student_id o nombre)
    let aq = supabaseAdmin.from('attendance_records').select('student_id,estado');
    const { data: attendance, error: aErr } = await aq;
    if (aErr) throw badRequest(aErr.message);

    const attMap = new Map();
    for (const r of attendance || []) {
      const key = String(r.student_id ?? 'desconocido').toLowerCase();
      attMap.set(key, (attMap.get(key) || 0) + (/inasist|falta|absen/i.test(r.estado || '') ? 1 : 0));
    }

    const results = [];
    for (const d of deliveries || []) {
      // Heuristica: attendance se cruza por nombre normalizado
      const key = d.student_name.toLowerCase();
      const absences = attMap.get(key) ?? 0;
      // attendance_score: 1 - inasistencias/20 (cap en 0)
      const attendanceScore = Math.max(0, 1 - absences / 20);
      const perf = computePerformance({
        tasksScore: d.tasks_score ?? 0,
        attendanceScore,
        punctualityScore: d.punctuality_score ?? 0,
      });
      results.push({
        period: period || 'default',
        student_name: d.student_name,
        student_id: key,
        tasks_score: d.tasks_score,
        attendance_score: attendanceScore,
        absences,
        score: perf.score,
        grade: perf.grade,
      });
    }

    if (results.length) {
      const { error: upErr } = await supabaseAdmin
        .from('student_performance')
        .upsert(results, { onConflict: 'period,student_name' });
      if (upErr) throw badRequest(upErr.message);
    }

    res.json({ recalculated: results.length, students: results });
  } catch (e) { next(e); }
});

export default router;
