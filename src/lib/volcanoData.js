import { idbGet, idbSet, STORE_MAP_DATA } from './idb.js';

const CACHE_KEY = 'volcano-list-v1';

let listPromise = null;

/**
 * public/data/volcano_list.json（火山マスタ: code/latlon/name_jp/name_en/
 * levelOperation）を読み込む。IndexedDBにキャッシュし、以降はキャッシュから
 * 即座に返す（静的データのため当日再取得は不要）。
 */
export function loadVolcanoList() {
  if (!listPromise) {
    listPromise = (async () => {
      const cached = await idbGet(STORE_MAP_DATA, CACHE_KEY);
      if (cached) return cached;
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}data/volcano_list.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await idbSet(STORE_MAP_DATA, CACHE_KEY, json);
      return json;
    })().catch((err) => {
      listPromise = null; // allow retry on next call
      throw err;
    });
  }
  return listPromise;
}
