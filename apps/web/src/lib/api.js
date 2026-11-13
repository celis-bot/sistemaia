import { env } from '$env/dynamic/public';
import { goto } from '$app/navigation';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { createClient } from '@supabase/supabase-js';

export const API_URL = env.PUBLIC_API_URL || 'http://localhost:4000';

export const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.PUBLIC_SUPABASE_ANON_KEY);

const TOKEN_KEY = 'sistema_token';
const USER_KEY = 'sistema_user';

function readStored() {
  if (!browser) return { token: null, user: null };
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
    };
  } catch {
    return { token: null, user: null };
  }
}

const initial = readStored();
export const session = writable({ token: initial.token, user: initial.user });

export function getToken() {
  let token = null;
  session.subscribe((s) => (token = s.token))();
  return token;
}

export async function login(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  setSession(body);
  return body;
}

export async function signup(email, password, fullName) {
  const res = await fetch(`${API_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  if (body.token) setSession(body);
  return body;
}

export function signOut() {
  if (browser) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  session.set({ token: null, user: null });
}

function setSession(body) {
  if (!browser) return;
  localStorage.setItem(TOKEN_KEY, body.token);
  localStorage.setItem(USER_KEY, JSON.stringify(body.user));
  session.set({ token: body.token, user: body.user });
}

async function getSupabaseToken() {
  if (!browser) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function api(path, options = {}) {
  const token = getToken() || (await getSupabaseToken());
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    signOut();
    goto('/');
    throw new Error('Sesion expirada');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}
