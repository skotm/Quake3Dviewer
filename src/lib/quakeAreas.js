/* ─────────────────────────────────────────────────────
   観測点マッチング・細分区域(震度速報の地域単位)の集計
   MeteoQuake(App.tsx)から移植。震度分布を地図に塗る/観測点マーカーを
   置くための下ごしらえ。
   ───────────────────────────────────────────────────── */

import { idbGet, idbSet, STORE_MAP_DATA } from './idb.js';
import { INTENSITY_ORDER } from './quakeFeed.js';

async function loadJsonWithCache(cacheKey, url) {
  const cached = await idbGet(STORE_MAP_DATA, cacheKey);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  const json = await res.json();
  await idbSet(STORE_MAP_DATA, cacheKey, json);
  return json;
}

let stationsPromise = null;
export function loadQuakeStations() {
  if (!stationsPromise) {
    const base = import.meta.env.BASE_URL;
    stationsPromise = loadJsonWithCache('quake-stations-v1', `${base}data/quake_stations.json`);
  }
  return stationsPromise;
}

let regionsPromise = null;
export function loadQuakeRegions() {
  if (!regionsPromise) {
    const base = import.meta.env.BASE_URL;
    regionsPromise = loadJsonWithCache('quake-regions-v1', `${base}data/quake_regions.json`);
  }
  return regionsPromise;
}

/* ---------- 細分区域名の表記ゆれ吸収・検索 ---------- */

function normalizeAreaNameForMatch(name) {
  if (!name) return '';
  return name.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
}

function findAreaFeaturesByName(regionsGeoJSON, name) {
  if (!regionsGeoJSON || !Array.isArray(regionsGeoJSON.features) || !name) return [];
  const exact = regionsGeoJSON.features.filter((f) => f.properties?.name === name);
  if (exact.length > 0) return exact;
  const normalizedTarget = normalizeAreaNameForMatch(name);
  return regionsGeoJSON.features.filter((f) => normalizeAreaNameForMatch(f.properties?.name) === normalizedTarget);
}

// ポリゴン外周リング頂点の単純平均から、地域の概算の代表点を求める
// (震度速報には観測点個別の座標が無いため、区域アイコンを置く位置に使う)。
function polygonRoughCentroid(geometry) {
  if (!geometry) return null;
  let ring = null;
  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates?.[0];
  } else if (geometry.type === 'MultiPolygon') {
    let bestLen = -1;
    for (const poly of geometry.coordinates || []) {
      const r = poly?.[0];
      if (r && r.length > bestLen) { bestLen = r.length; ring = r; }
    }
  }
  if (!ring || ring.length === 0) return null;
  let sumLat = 0, sumLon = 0;
  for (const pt of ring) { sumLon += pt[0]; sumLat += pt[1]; }
  return { lat: sumLat / ring.length, lon: sumLon / ring.length };
}

/* ---------- 観測点マッチング ---------- */

// P2P地震情報APIのpoints[]要素({pref, addr})を、観測点マスタと突き合わせる。
// 1. 地点名の完全一致 + 都道府県名一致 → 2. 都道府県名一致の中から部分一致、の2段階。
function matchStation(stations, point) {
  const exact = stations.find((s) => s.name === point.addr && s.pref === point.pref);
  if (exact) return exact;

  const partial = stations.find((s) =>
    s.pref === point.pref &&
    (s.name.includes(point.addr) || point.addr.includes(s.name) ||
     (s.city && point.addr.includes(s.city)))
  );
  return partial || null;
}

/**
 * points[](地震情報APIの震度分布)を、観測点マスタ・細分区域データと突き合わせて
 * 地図・一覧で使える形(緯度経度+震度キー付き)に変換する。
 * isArea:true(震度速報、地域単位) → 細分区域ポリゴンの重心を代表点にする。
 * isArea:false(確定報、観測点単位) → 観測点マスタの座標をそのまま使う。
 * マスタに見つからなかった地点は緯度経度がnullのまま返す(一覧には残すが地図には出せない)。
 */
export function resolveStationPoints(points, stations, regionsGeoJSON) {
  return points.map((p) => {
    if (p.isArea) {
      const features = findAreaFeaturesByName(regionsGeoJSON, p.addr);
      const areaCodes = features.map((f) => f.properties?.code).filter((c) => c != null);
      let latitude = null, longitude = null;
      const centroids = features.map((f) => polygonRoughCentroid(f.geometry)).filter(Boolean);
      if (centroids.length > 0) {
        latitude = centroids.reduce((sum, c) => sum + c.lat, 0) / centroids.length;
        longitude = centroids.reduce((sum, c) => sum + c.lon, 0) / centroids.length;
      }
      return {
        pref: p.pref, addr: p.addr, city: null,
        intensityKey: SCALE_TO_KEY(p.scale),
        latitude, longitude,
        areaCode: areaCodes[0] || null, areaCodes,
        isArea: true,
      };
    }

    const station = matchStation(stations, p);
    return {
      pref: p.pref, addr: p.addr, city: station?.city || null,
      intensityKey: SCALE_TO_KEY(p.scale),
      latitude: station ? station.lat : null,
      longitude: station ? station.lon : null,
      areaCode: station?.areaCode || null,
      areaCodes: station?.areaCode ? [station.areaCode] : [],
      isArea: false,
    };
  });
}

// quakeFeed.jsのmaxScaleToIntensityKeyと同じ変換だが、ここでは公開していない
// 内部関数を再定義せず、pointsのscale(10刻みJMAコード)を直接キーへ変換する。
function SCALE_TO_KEY(scale) {
  const map = {
    '-1': '0', '0': '0',
    '10': '1', '20': '2', '30': '3', '40': '4',
    '44': '5', '45': '5-', '50': '5+', '46': '5u',
    '54': '6', '55': '6-', '60': '6+', '70': '7',
  };
  return map[String(scale)] ?? '?';
}

/**
 * 観測点(緯度経度+震度キー付き)の配列を、細分区域コードごとに集計する。
 * 各区域には、その区域内で観測された最大震度を割り当てる。
 */
export function aggregateByArea(resolvedPoints) {
  const maxByArea = new Map();
  for (const p of resolvedPoints) {
    const codes = (p.areaCodes && p.areaCodes.length > 0) ? p.areaCodes : (p.areaCode ? [p.areaCode] : []);
    for (const code of codes) {
      const current = maxByArea.get(code);
      if (!current || INTENSITY_ORDER.indexOf(p.intensityKey) > INTENSITY_ORDER.indexOf(current)) {
        maxByArea.set(code, p.intensityKey);
      }
    }
  }
  return maxByArea;
}
