/* ─────────────────────────────────────────────────────
   気象庁 震度データベース(eqdb)検索。MeteoQuake(App.tsx)の
   QuakeSearchPanel/fetchEqdbSearch等を移植したもの。P2P地震情報(リアルタイム)
   とは別の、期間・M・最大震度・震源地名で過去の地震を検索できるAPI。
   ───────────────────────────────────────────────────── */

import { idbGet, idbSet, STORE_MAP_DATA } from './idb.js';
import { maxScaleToIntensityKey } from './quakeFeed.js';

const EQDB_API_URL = 'https://www.data.jma.go.jp/eqdb/data/shindo/api/';
const EQDB_DATE_RANGE_URL = 'https://www.data.jma.go.jp/eqdb/data/shindo/js/date.json';

/* ---------- 検索フォームの選択肢 ---------- */

export const EQDB_MAX_INT_OPTIONS = [
  { value: '1', label: '指定なし（震度1以上）' },
  { value: '2', label: '震度2以上' },
  { value: '3', label: '震度3以上' },
  { value: '4', label: '震度4以上' },
  { value: 'A', label: '震度5弱以上' },
  { value: 'B', label: '震度5強以上' },
  { value: 'C', label: '震度6弱以上' },
  { value: 'D', label: '震度6強以上' },
  { value: '7', label: '震度7' },
];
const EQDB_MAX_INT_SCALE = { '1': 10, '2': 20, '3': 30, '4': 40, A: 45, B: 50, C: 55, D: 60, '7': 70 };

export const EQDB_SORT_OPTIONS = [
  { value: 'S0', label: '新しい順' },
  { value: 'S1', label: '古い順' },
  { value: 'S2', label: '最大震度の大きい順' },
  { value: 'S3', label: '地震の規模の大きい順' },
];

// "1.0"〜"9.9"
export const EQDB_MIN_MAG_OPTIONS = [
  { value: '0.0', label: '指定なし' },
  ...Array.from({ length: 90 }, (_, i) => {
    const v = ((i + 10) / 10).toFixed(1);
    return { value: v, label: `M${v}以上` };
  }),
];

export const EQDB_MIN_DATE = '1919-01-01';

function eqdbDateValue(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function eqdbMaxEndDate(realEn) {
  if (realEn) return realEn;
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return eqdbDateValue(d);
}

export function defaultEqdbDateRange() {
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { start: eqdbDateValue(start), end: eqdbMaxEndDate() };
}

/* ---------- 実際の収録期間(date.json) ---------- */

let eqdbDateRangePromise = null;
export function loadEqdbDateRange() {
  if (!eqdbDateRangePromise) {
    eqdbDateRangePromise = fetch(EQDB_DATE_RANGE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data || typeof data.st !== 'string' || typeof data.en !== 'string') {
          throw new Error('date.jsonの形式が想定と異なります');
        }
        return { st: data.st, en: data.en };
      })
      .catch((err) => {
        eqdbDateRangePromise = null; // 失敗時は次回呼び出しで再取得を試みられるようにする
        throw err;
      });
  }
  return eqdbDateRangePromise;
}

/* ---------- 震度文字列 <-> スケール変換 ---------- */

// "震度５弱"/"５弱"/"震度７"/"5弱(推定)" のような文字列を、10刻みのJMAスケール
// (10=震度1 ... 70=震度7、44/54=区分の無い旧震度5・6)に変換する。
export function eqdbIntensityStringToScale(raw) {
  if (!raw) return 0;
  const str = raw.replace(/震度/g, '').replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  if (str.includes('7')) return 70;
  if (str.includes('6')) return str.includes('強') ? 60 : str.includes('弱') ? 55 : 54;
  if (str.includes('5')) return str.includes('強') ? 50 : str.includes('弱') ? 45 : 44;
  if (str.includes('4')) return 40;
  if (str.includes('3')) return 30;
  if (str.includes('2')) return 20;
  if (str.includes('1')) return 10;
  return 0;
}

// 「◯弱以上」の検索条件は、区分の無い旧震度階級(44/54)もヒットするとみなす。
function eqdbIntensityThresholdScale(raw) {
  const scale = eqdbIntensityStringToScale(raw);
  if (scale === 44) return 45;
  if (scale === 54) return 55;
  return scale;
}

// eqdbのid(dbid)は "YYYYMMDDHHMMSS..." 形式の発生時刻エンコード文字列。
// アプリ内の他の地震カードと表示を揃えるため "YYYY/MM/DD HH:MM:SS" に変換する。
function eqdbIdToTimeDisplay(id) {
  if (!id || id.length < 14) return '';
  return `${id.slice(0, 4)}/${id.slice(4, 6)}/${id.slice(6, 8)} ${id.slice(8, 10)}:${id.slice(10, 12)}:${id.slice(12, 14)}`;
}

/* ---------- 検索・詳細取得 ---------- */

export async function fetchEqdbSearch({ startDate, endDate, startTime = '00:00', endTime = '23:59', minMag, maxInt, sort, epi }) {
  const epiValue = epi || '99';
  const isFiltered = minMag > 0 || maxInt !== '1' || epiValue !== '99';
  const fd = new FormData();
  fd.append('mode', 'search');
  fd.append('dateTimeF[]', startDate); fd.append('dateTimeF[]', startTime);
  fd.append('dateTimeT[]', endDate); fd.append('dateTimeT[]', endTime);
  fd.append('mag[]', minMag.toFixed(1)); fd.append('mag[]', '9.9');
  fd.append('dep[]', '000'); fd.append('dep[]', '999');
  fd.append('epi[]', epiValue); fd.append('pref[]', '99'); fd.append('city[]', '99'); fd.append('station[]', '99');
  fd.append('obsInt', '1');
  fd.append('maxInt', maxInt);
  fd.append('additionalC', isFiltered ? 'true' : 'false');
  fd.append('Sort', sort);
  fd.append('Comp', 'C0');
  fd.append('seisCount', 'false');
  fd.append('observed', 'false');
  fd.append('strParam', '[object Object]');

  const res = await fetch(EQDB_API_URL, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data.res) ? data.res : [];
  const strMsgs = Array.isArray(data.str) ? data.str : [];
  const errMsg = strMsgs.find((s) => s.includes('ありません') || s.includes('エラー') || s.includes('見直し'));
  return { list, errMsg, summary: strMsgs[1] || '' };
}

async function fetchEqdbEvent(id) {
  const fd = new FormData();
  fd.append('mode', 'event');
  fd.append('id', id);
  const res = await fetch(EQDB_API_URL, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.res && Array.isArray(data.res.hyp) && data.res.hyp.length > 0) return data.res;
  return null;
}

const eqdbEventDetailCache = new Map();
export async function fetchEqdbEventCached(id) {
  if (eqdbEventDetailCache.has(id)) return eqdbEventDetailCache.get(id);
  const detail = await fetchEqdbEvent(id);
  if (detail) eqdbEventDetailCache.set(id, detail);
  return detail;
}

/* ---------- 検索結果 -> カード変換 ---------- */

// 検索結果一覧の1行分(観測点別震度は含まない軽量なプレビュー)。
export function eqdbListItemToPreview(eq) {
  const scale = eqdbIntensityStringToScale(eq.maxI || '');
  const depMatch = (eq.dep || '').match(/\d+/);
  const mag = parseFloat(eq.mag);
  return {
    id: eq.id,
    time: eqdbIdToTimeDisplay(eq.id) || eq.ot || '',
    place: eq.name || '震源地不明',
    maxIntensity: scale > 0 ? maxScaleToIntensityKey(scale) : '?',
    isForeign: false,
    magnitude: Number.isFinite(mag) && mag > 0 ? mag : null,
    depth: depMatch ? parseInt(depMatch[0], 10) : null,
  };
}

// mode=eventの詳細(観測点別震度・lat/lon込み)から、アプリ内の他の地震カードと
// 同じ形の完全なカードを作る。observed pointsは既に緯度経度付きで返ってくるため、
// (P2P地震情報のpointsと違って)観測点マスタとの突き合わせは不要 — isEqdb:trueで
// 区別し、呼び出し側(quakeMapSync.js)はresolvedPointsをそのまま使う。
export function buildEqdbQuakeCard(detail, listItem) {
  const hyp = detail.hyp[0];
  const intPoints = Array.isArray(detail.int) ? detail.int : [];

  const lat = parseFloat(hyp.lat);
  const lon = parseFloat(hyp.lon);
  const mag = parseFloat(hyp.mag);
  const depMatch = (hyp.dep || '').match(/\d+/);
  const depth = depMatch ? parseInt(depMatch[0], 10) : 0;
  const maxScale = eqdbIntensityStringToScale(hyp.maxI || '');

  const resolvedPoints = intPoints
    .map((pt) => {
      const scale = eqdbIntensityStringToScale(pt.int || '');
      if (scale <= 0) return null;
      const pLat = parseFloat(pt.lat);
      const pLon = parseFloat(pt.lon);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return null;
      return { latitude: pLat, longitude: pLon, intensityKey: maxScaleToIntensityKey(scale) };
    })
    .filter(Boolean);

  return {
    id: `eqdb_${listItem?.id || hyp.name}`,
    time: eqdbIdToTimeDisplay(listItem?.id) || listItem?.ot || '',
    stage: null,
    place: hyp.name || listItem?.name || '震源地不明',
    maxIntensity: maxScaleToIntensityKey(maxScale),
    isForeign: false,
    isEqdb: true,
    magnitude: Number.isFinite(mag) && mag > 0 ? mag : null,
    depth: Number.isFinite(depth) ? depth : null,
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lon) ? lon : null,
    points: [],
    resolvedPoints,
    // eqdbには津波情報が含まれないため、津波の心配なし文言をデフォルトにしておく
    domesticTsunami: 'None',
    freeFormComment: '気象庁 震度データベースより取得',
  };
}

/* ---------- 震源地名プルダウン(ep.json由来) ---------- */

let epicenterNamesPromise = null;
function loadEpicenterNamesGeoJSON() {
  if (!epicenterNamesPromise) {
    epicenterNamesPromise = (async () => {
      const cacheKey = 'quake-epicenter-names-v1';
      const cached = await idbGet(STORE_MAP_DATA, cacheKey);
      if (cached) return cached;
      const base = import.meta.env.BASE_URL;
      const res = await fetch(`${base}data/quake_epicenter_names.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      await idbSet(STORE_MAP_DATA, cacheKey, json);
      return json;
    })();
  }
  return epicenterNamesPromise;
}

// 震源地名の選択肢(プルダウン)。カタカナ表記の震源地名(海外の地名など)は
// 五十音順だと国内の地名の間に混ざって探しにくいため、まとめて末尾に回す。
export async function loadEpicenterNameOptions() {
  const geojson = await loadEpicenterNamesGeoJSON();
  const startsWithKatakana = (s) => /^[\u30A0-\u30FF]/.test(s);
  const names = Array.from(new Set((geojson.features || []).map((f) => f.properties?.name).filter(Boolean))).sort((a, b) => {
    const aKana = startsWithKatakana(a);
    const bKana = startsWithKatakana(b);
    if (aKana !== bKana) return aKana ? 1 : -1;
    return a.localeCompare(b, 'ja');
  });
  return [{ value: '', label: '指定なし' }, ...names.map((n) => ({ value: n, label: n }))];
}

/* ---------- 検索結果の絞り込み・並び替え(サーバー側条件の後処理) ---------- */

export function filterAndSortEqdbResults(list, { minMagNum, maxInt, epicenterName, sort }) {
  const maxIntScale = EQDB_MAX_INT_SCALE[maxInt] || 10;
  const filtered = list.filter((eq) => {
    const magOk = minMagNum <= 0 || parseFloat(eq.mag) >= minMagNum;
    const intOk = maxInt === '1' || eqdbIntensityThresholdScale(eq.maxI || '') >= maxIntScale;
    const nameOk = !epicenterName || eq.name === epicenterName;
    return magOk && intOk && nameOk;
  });
  if (sort === 'S2') {
    filtered.sort((a, b) => eqdbIntensityStringToScale(b.maxI || '') - eqdbIntensityStringToScale(a.maxI || '') || parseFloat(b.mag) - parseFloat(a.mag));
  } else if (sort === 'S3') {
    filtered.sort((a, b) => parseFloat(b.mag) - parseFloat(a.mag) || eqdbIntensityStringToScale(b.maxI || '') - eqdbIntensityStringToScale(a.maxI || ''));
  }
  return filtered;
}
