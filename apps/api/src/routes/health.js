import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), pid: process.pid });
});

router.get('/ready', async (_req, res) => {
  // Aqui se pueden agregar checks de Supabase / Redis
  res.json({ status: 'ready' });
});

export default router;
