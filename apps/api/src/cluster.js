import cluster from 'node:cluster';
import os from 'node:os';
import env from './config/env.js';
import { logger } from './lib/logger.js';

// Balanceador de cargas simple basado en cluster de Node:
// el proceso maestro distribuye conexiones entre N workers.
// Para balanceo real multi-servidor usar nginx (ver infra/nginx.conf) o Redis.
const numCPUs = env.CLUSTER_WORKERS || os.cpus().length;

if (cluster.isPrimary) {
  logger.info(`Master ${process.pid} iniciando ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} murio (${signal || code}). Reiniciando...`);
    cluster.fork();
  });
} else {
  const { createApp } = await import('./app.js');
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(`Worker ${process.pid} escuchando en :${env.PORT}`);
  });
}
