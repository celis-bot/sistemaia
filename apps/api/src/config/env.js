import 'dotenv/config';
import { z } from 'zod';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Carga .env desde la raiz del monorepo si existe
const rootEnv = join(__dirname, '..', '..', '..', '..', '.env');
try {
  const { config } = await import('dotenv');
  config({ path: rootEnv });
} catch { /* noop */ }

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().optional(),

  MS_TENANT_ID: z.string().default('common'),
  MS_CLIENT_ID: z.string().default(''),
  MS_CLIENT_SECRET: z.string().default(''),
  TEAMS_TEAM_ID: z.string().default(''),
  TEAMS_CHANNEL_ID: z.string().default(''),

  CONECTA_UACJ_URL: z.string().url().default('https://conecta.uacj.mx'),
  CONECTA_USER: z.string().default(''),
  CONECTA_PASS: z.string().default(''),
  CONECTA_USER_SELECTOR: z.string().default('input[name="usuario"]'),
  CONECTA_PASS_SELECTOR: z.string().default('input[name="password"]'),
  CONECTA_SUBMIT_SELECTOR: z.string().default('button[type="submit"]'),
  CONECTA_TABLE_SELECTOR: z.string().default('table.asistencias'),

  WEIGHT_TASKS: z.coerce.number().default(0.5),
  WEIGHT_ATTENDANCE: z.coerce.number().default(0.3),
  WEIGHT_PUNCTUALITY: z.coerce.number().default(0.2),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  LOCAL_AUTH_ENABLED: z.coerce.boolean().default(false),
  LOCAL_JWT_SECRET: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().default(12),

  CLUSTER_WORKERS: z.coerce.number().default(0),
  REDIS_URL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variables de entorno invalidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const weightSum = env.WEIGHT_TASKS + env.WEIGHT_ATTENDANCE + env.WEIGHT_PUNCTUALITY;
if (Math.abs(weightSum - 1) > 0.001) {
  console.warn(`[config] Los pesos de ponderacion suman ${weightSum}, se normalizaran.`);
}

export default env;
