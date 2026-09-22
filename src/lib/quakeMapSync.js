import { loadQuakeStations, loadQuakeRegions, resolveStationPoints, aggregateByArea } from './quakeAreas.js';
import { getIntensityStyle } from './quakeFeed.js';

/**
 * Paints a quake's hypocenter marker + felt-area distribution on the map,
 * and fits the camera to it (once per quake — `fitKeyRef` tracks that so a
 * colorScheme change alone doesn't yank the camera back). Works for both a
 * raw P2P地震情報 card (`points`, resolved here against the station/region
 * data) and an eqdb-origin card (`resolvedPoints`, already resolved —
 * see eqdb.js's buildEqdbQuakeCard).
 *
 * `fitKeyRef` is a plain `{ current }` ref owned by the caller, so two
 * independent panels (recent list vs. search) each get their own
 * "have I already fit the camera for this selection" bookkeeping even
 * though they share one map engine.
 *
 * `cancelToken` (optional, `{ cancelled }`) lets the caller abort a
 * still-in-flight call — e.g. the effect's cleanup sets `.cancelled = true`
 * when `quake` changes again before the station/region fetch resolves, so a
 * stale response can't paint over a newer selection.
 */
export async function syncQuakeToMap(engine, quake, colorScheme, fitKeyRef, cancelToken) {
  if (!engine) return;

  if (!quake) {
    engine.clearQuakeIntensity?.();
    engine.setSelectedQuakeHypocenter?.(null);
    if (fitKeyRef) fitKeyRef.current = null;
    return;
  }

  const hasHypo = quake.latitude != null && quake.longitude != null;
  engine.setSelectedQuakeHypocenter?.(
    hasHypo
      ? { lat: quake.latitude, lon: quake.longitude, depth: quake.depth ?? 10, mag: quake.magnitude, time: quake.time }
      : null
  );

  const rawPoints = quake.isEqdb ? quake.resolvedPoints : quake.points;
  const hasPoints = Array.isArray(rawPoints) && rawPoints.length > 0;

  if (!hasPoints) {
    engine.clearQuakeIntensity?.();
    const key = `${quake.id}:hypo`;
    if (hasHypo && fitKeyRef?.current !== key) {
      engine.fitQuakeBounds?.([[quake.longitude, quake.latitude]]);
      if (fitKeyRef) fitKeyRef.current = key;
    }
    return;
  }

  // eqdb(気象庁震度データベース)の観測点は既に緯度経度・震度キー付きの
  // resolvedPointsとして渡ってくる(観測点マスタとの突き合わせが不要)。
  // P2P地震情報はpointsが生の{pref,addr,scale,isArea}なので、こちらは
  // 従来通りresolveStationPointsで観測点マスタ・細分区域と突き合わせる。
  let resolved;
  if (quake.isEqdb) {
    resolved = quake.resolvedPoints.map((p) => ({ ...p, isArea: false }));
  } else {
    const [stations, regions] = await Promise.all([loadQuakeStations(), loadQuakeRegions()]);
    if (cancelToken?.cancelled) return;
    resolved = resolveStationPoints(quake.points, stations, regions);
  }

  const areaByCode = aggregateByArea(resolved.filter((p) => p.isArea));
  const areaColors = new Map();
  areaByCode.forEach((intensityKey, code) => {
    areaColors.set(code, getIntensityStyle(colorScheme, intensityKey).bg);
  });
  const stationFeatures = resolved
    .filter((p) => !p.isArea && p.latitude != null && p.longitude != null)
    .map((p) => ({ lon: p.longitude, lat: p.latitude, intensityKey: p.intensityKey }));
  if (cancelToken?.cancelled) return;
  engine.showQuakeIntensity?.(areaColors, stationFeatures, colorScheme);

  // 揺れを観測した全地点(+震源)が収まるようにズーム。同じ地震につき1回だけ
  // (配色切り替えだけでは再フィットしない)。P2P地震情報は段階が進んで
  // 観測点データが後から届くと`${id}:pts`キーが新しく生じるので再フィットする。
  const key = `${quake.id}:pts`;
  if (fitKeyRef?.current !== key) {
    const felt = resolved.filter((p) => p.latitude != null && p.longitude != null).map((p) => [p.longitude, p.latitude]);
    const coords = hasHypo ? [[quake.longitude, quake.latitude], ...felt] : felt;
    if (coords.length > 0) {
      engine.fitQuakeBounds?.(coords);
      if (fitKeyRef) fitKeyRef.current = key;
    }
  }
}
