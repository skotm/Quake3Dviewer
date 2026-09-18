import { idbGet, idbSet, STORE_QUAKE_DAYS } from './idb.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Returns 'YYYY-MM-DD' for a Date, using its UTC fields shifted so that the
// resulting calendar date matches JST (JMA publishes one file per JST day).
function jstDateKey(date) {
  const jst = new Date(date.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
}

function urlForDateKey(key) {
  const [y, m, d] = key.split('-');
  return `https://www.jma.go.jp/bosai/hypo/data/${y}/${m}/hypo${y}${m}${d}.geojson`;
}

// properties.date looks like "2026/09/15.00:01" and represents JST local time.
function parseJmaTime(dateStr) {
  const [datePart, timePart] = dateStr.split('.');
  const [y, mo, d] = datePart.split('/').map(Number);
  const [h, mi] = (timePart || '0:0').split(':').map(Number);
  // Treat the given clock time as JST (UTC+9): the UTC instant is 9h earlier.
  return Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600 * 1000;
}

function normalizeFeature(feature, dateKey) {
  const [lon, lat] = feature.geometry.coordinates;
  const p = feature.properties || {};
  return {
    lon,
    lat,
    depth: parseFloat(p.dep),
    mag: parseFloat(p.mag),
    place: p.place || '',
    time: p.date ? parseJmaTime(p.date) : null,
    intensity: (p.si || '').trim(),
    dayKey: dateKey,
  };
}

/** Returns an array of 'YYYY-MM-DD' keys for the last `days` days, inclusive of today (JST), oldest first. */
export function lastNDateKeys(days) {
  const keys = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    keys.push(jstDateKey(new Date(now.getTime() - i * 86400000)));
  }
  return keys;
}

async function fetchDay(dateKey) {
  const url = urlForDateKey(dateKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const geojson = await res.json();
  return (geojson.features || []).map((f) => normalizeFeature(f, dateKey));
}

const todayKey = () => jstDateKey(new Date());

/**
 * Loads earthquake data for the last `days` days, using IndexedDB as a cache
 * for every day except today (today's file is still being appended to by JMA
 * over the course of the day, so it is always re-fetched).
 *
 * @param {number} days
 * @param {(done:number, total:number)=>void} [onProgress]
 * @param {number} [concurrency]
 */
export async function loadRecentQuakes(days, onProgress, concurrency = 8) {
  const keys = lastNDateKeys(days);
  const today = todayKey();
  const results = new Array(keys.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < keys.length) {
      const idx = cursor++;
      const key = keys[idx];
      try {
        if (key !== today) {
          const cached = await idbGet(STORE_QUAKE_DAYS, key);
          if (cached) {
            results[idx] = cached;
            done++;
            onProgress?.(done, keys.length);
            continue;
          }
        }
        const features = await fetchDay(key);
        results[idx] = features;
        if (key !== today) {
          await idbSet(STORE_QUAKE_DAYS, key, features);
        }
      } catch (err) {
        console.warn('Failed to load quake day', key, err);
        results[idx] = null; // mark failure, distinguishable from "no quakes" ([])
      }
      done++;
      onProgress?.(done, keys.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, keys.length) }, worker);
  await Promise.all(workers);

  const failedDays = keys.filter((k, i) => results[i] === null);
  const features = results.filter(Boolean).flat();
  return { features, failedDays, requestedDays: keys.length };
}
