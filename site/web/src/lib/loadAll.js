import { base44 } from "@/api/base44Client";

// Short-lived in-memory cache. This makes repeated navigation between pages
// effectively instant while still allowing fresh data to arrive regularly.
const cache = new Map();
const pending = new Map();
const CACHE_MS = 15000;

/**
 * Loads ALL records from an entity by paginating through the list API.
 * Results are cached briefly and simultaneous identical requests share one
 * network request. This is especially helpful for large directories.
 * @param {string} entityName - e.g. "Repeater"
 * @param {string} sort - sort spec e.g. "-rating"
 * @param {number} pageSize - records per page (default 500, compatible with the entity list API max)
 */
export async function loadAll(entityName, sort = "-created_date", pageSize = 500) {
  const key = `${entityName}|${sort}|${pageSize}`;
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && now - cached.timestamp < CACHE_MS) {
    return cached.data;
  }

  if (pending.has(key)) {
    return pending.get(key);
  }

  const request = (async () => {
    let all = [];
    let skip = 0;

    while (true) {
      const batch = await base44.entities[entityName].list(sort, pageSize, skip);
      if (!batch || !batch.length) break;
      all = all.concat(batch);
      if (batch.length < pageSize) break;
      skip += pageSize;
    }

    cache.set(key, { data: all, timestamp: Date.now() });
    return all;
  })();

  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

export function clearLoadAllCache(entityName = null) {
  if (!entityName) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.startsWith(`${entityName}|`)) cache.delete(key);
  }
}
