// Wrapper serverless para Vercel: exporta la app Express.
// Vercel detecta apps/api/api/index.js como funcion serverless.
import { createApp } from '../src/app.js';

const app = createApp();
export default app;
