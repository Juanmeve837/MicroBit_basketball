const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value) {
  cache.set(key, { value, time: Date.now() });
}

export function invalidate(key) {
  if (key) cache.delete(key);
  else cache.clear();
}
