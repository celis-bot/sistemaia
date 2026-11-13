#!/usr/bin/env node
// Seed: crea tablas basicas si no existen (idempotente) usando service role.
// La creacion real de tablas se hace con las migraciones SQL en supabase/migrations.
import 'dotenv/config';
import { supabaseAdmin } from '../src/services/supabase.js';
import { hashPassword } from '../src/lib/passwords.js';

const email = process.env.SEED_ADMIN_EMAIL || 'admin@sistema.local';
const password = process.env.SEED_ADMIN_PASSWORD || 'cambia-esta-clave';

const password_hash = await hashPassword(password);

const { data, error } = await supabaseAdmin
  .from('app_users')
  .upsert({ email, password_hash, role: 'admin' }, { onConflict: 'email' })
  .select('id, email, role')
  .single();

if (error) {
  console.error('Seed fallo:', error.message);
  console.error('Asegurate de haber aplicado supabase/migrations/001_init.sql');
  process.exit(1);
}

console.log('Usuario admin listo:', data);
console.log('Recuerda cambiar la contrasena si usas la por defecto.');
