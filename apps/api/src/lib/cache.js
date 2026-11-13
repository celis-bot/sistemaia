// Cache simple en memoria con TTL (por proceso).
// Para multiples instancias usar Redis (REDIS_URL) detras de un store compartido.
const store = new Map();

export function cacheGet(key, ttlMs = 5 * 60 * 1000) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs = 5 * 60 * 1000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Evita crecimiento ilimitado
  if (store.size > 500) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function cacheKey(...parts) {
  return parts.join(':');
}
