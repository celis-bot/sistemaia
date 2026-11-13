import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  findExcelAttachments,
  downloadAttachment,
  getTeamInfo,
  listChannels,
} from '../services/microsoftGraph.js';
import { parseDeliveriesExcel } from '../services/excelParser.js';
import { aggregateDeliveries } from '../services/weighting.js';
import { supabaseAdmin } from '../services/supabase.js';
import { cacheGet, cacheSet, cacheKey } from '../lib/cache.js';
import { badRequest, notFound } from '../lib/errors.js';
import env from '../config/env.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'docente'));

// Info del equipo configurado
router.get('/team', async (_req, res, next) => {
  try {
    const info = await getTeamInfo();
    res.json(info ?? { teamId: env.TEAMS_TEAM_ID });
  } catch (e) { next(e); }
});

router.get('/channels', async (_req, res, next) => {
  try {
    res.json({ channels: await listChannels() });
  } catch (e) { next(e); }
});

// Lista archivos Excel adjuntos en los canales
router.get('/attachments', async (req, res, next) => {
  try {
    const { top = 50, since } = req.query;
    const key = cacheKey('teams:attachments', String(top), String(since || ''));
    const cached = cacheGet(key);
    if (cached) return res.json(cached);
    const files = await findExcelAttachments({ top: Number(top), since });
    const payload = { files, count: files.length };
    cacheSet(key, payload, 60_000);
    res.json(payload);
  } catch (e) { next(e); }
});

// Descarga + parsea un Excel y persiste entregas en Supabase
router.post('/import/:fileName', async (req, res, next) => {
  try {
    const files = await findExcelAttachments({ top: 100 });
    const file = files.find((f) => f.fileName === req.params.fileName);
    if (!file) throw notFound('Archivo no encontrado en Teams');

    const buffer = await downloadAttachment(file.contentUrl);
    const { rows } = await parseDeliveriesExcel(buffer);
    const aggregated = aggregateDeliveries(rows);

    const { data: importRun, error: runErr } = await supabaseAdmin
      .from('import_runs')
      .insert({ source: 'teams', file_name: file.fileName, total_rows: rows.length })
      .select('id')
      .single();
    if (runErr) throw badRequest(runErr.message);

    const records = aggregated.map((a) => ({
      import_run_id: importRun.id,
      student_name: a.student_name,
      total_tasks: a.total_tasks,
      delivered_tasks: a.delivered_tasks,
      on_time_tasks: a.on_time_tasks,
      avg_grade: a.avg_grade,
      tasks_score: a.tasks_score,
      punctuality_score: a.punctuality_score,
    }));

    const { error: insErr } = await supabaseAdmin.from('task_deliveries').insert(records);
    if (insErr) throw badRequest(insErr.message);

    res.json({ importRunId: importRun.id, students: records.length, rows: rows.length });
  } catch (e) { next(e); }
});

export default router;
