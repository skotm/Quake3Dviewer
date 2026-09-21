import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRecentQuakes, connectQuakeWebSocket, mergeQuakeCards,
  loadStoredQuakeColorScheme, saveQuakeColorScheme,
  loadStoredQuakeFetchLimit, saveQuakeFetchLimit,
  getIntensityStyle,
} from './quakeFeed.js';
import { loadQuakeStations, loadQuakeRegions, resolveStationPoints, aggregateByArea } from './quakeAreas.js';

// Inserts/merges a freshly-arrived card (from the WebSocket) into an
// existing newest-first list, keyed by occurrence time — same grouping key
// dedupeQuakeList uses for the initial fetch, so a later-stage report for a
// quake already on screen (震度速報→震源情報→...) updates that entry in
// place instead of appearing as a second row.
function mergeIncoming(list, card) {
  const idx = list.findIndex((q) => q.time === card.time);
  if (idx === -1) return [card, ...list];
  const next = list.slice();
  next[idx] = mergeQuakeCards(next[idx], card);
  return next;
}

/**
 * engineRef: a ref to the QuakeMapEngine instance (from MapView's engineRef),
 * so selecting a quake can paint its felt-area distribution on the map.
 */
export function useQuakeFeed(engineRef) {
  const [quakes, setQuakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [colorScheme, setColorSchemeState] = useState(loadStoredQuakeColorScheme);
  const [fetchLimit, setFetchLimitState] = useState(loadStoredQuakeFetchLimit);
  const [wsStatus, setWsStatus] = useState('connecting');

  const reloadTokenRef = useRef(0);

  const load = useCallback(async (limit) => {
    setLoading(true);
    setError(null);
    const token = ++reloadTokenRef.current;
    try {
      const list = await fetchRecentQuakes(limit);
      if (reloadTokenRef.current !== token) return;
      setQuakes(list);
    } catch (err) {
      if (reloadTokenRef.current !== token) return;
      console.error(err);
      setError('地震情報の取得に失敗しました。');
    } finally {
      if (reloadTokenRef.current === token) setLoading(false);
    }
  }, []);

  // Initial fetch + realtime subscription (kept open for the component's
  // whole lifetime, not just while the panel is open, so new quakes are
  // already in the list the moment the person opens it).
  useEffect(() => {
    load(fetchLimit);
    const sub = connectQuakeWebSocket((card) => {
      setQuakes((prev) => mergeIncoming(prev, card));
    }, setWsStatus);
    return () => sub.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => load(fetchLimit), [load, fetchLimit]);

  const changeFetchLimit = useCallback((next) => {
    setFetchLimitState(next);
    saveQuakeFetchLimit(next);
    load(next);
  }, [load]);

  const changeColorScheme = useCallback((schemeId) => {
    setColorSchemeState(schemeId);
    saveQuakeColorScheme(schemeId);
  }, []);

  const selectQuake = useCallback((id) => setSelectedId(id), []);
  const back = useCallback(() => setSelectedId(null), []);

  const selected = selectedId != null ? quakes.find((q) => q.id === selectedId) || null : null;

  // Ties the map view + hypocenter marker + felt-area overlay to the
  // selected quake. Split into what needs re-running on every colorScheme
  // change (area/station painting) vs. what should only happen once per
  // quake selection (camera fit, hypocenter marker) — otherwise switching
  // the color scheme while a quake is open would yank the camera back to
  // the hypocenter every time.
  const lastFitKeyRef = useRef(null);

  useEffect(() => {
    const engine = engineRef?.current;
    if (!engine) return;

    if (!selected) {
      engine.clearQuakeIntensity?.();
      engine.setSelectedQuakeHypocenter?.(null);
      lastFitKeyRef.current = null;
      return;
    }

    const hasHypo = selected.latitude != null && selected.longitude != null;
    engine.setSelectedQuakeHypocenter?.(
      hasHypo ? { lat: selected.latitude, lon: selected.longitude, depth: selected.depth ?? 10, mag: selected.magnitude } : null
    );

    const hasPoints = Array.isArray(selected.points) && selected.points.length > 0;
    if (!hasPoints) {
      engine.clearQuakeIntensity?.();
      const key = `${selected.id}:hypo`;
      if (hasHypo && lastFitKeyRef.current !== key) {
        engine.fitQuakeBounds?.([[selected.longitude, selected.latitude]]);
        lastFitKeyRef.current = key;
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [stations, regions] = await Promise.all([loadQuakeStations(), loadQuakeRegions()]);
        if (cancelled) return;
        const resolved = resolveStationPoints(selected.points, stations, regions);
        const areaByCode = aggregateByArea(resolved.filter((p) => p.isArea));
        const areaColors = new Map();
        areaByCode.forEach((intensityKey, code) => {
          areaColors.set(code, getIntensityStyle(colorScheme, intensityKey).bg);
        });
        const stationFeatures = resolved
          .filter((p) => !p.isArea && p.latitude != null && p.longitude != null)
          .map((p) => ({ lon: p.longitude, lat: p.latitude, intensityKey: p.intensityKey }));
        if (cancelled) return;
        engine.showQuakeIntensity?.(areaColors, stationFeatures, colorScheme);

        // 揺れを観測した全地点(+震源)が収まるようにズーム。段階が進んで
        // (震度速報→確定報)観測点データが新たに届いた時だけ、同じ地震に
        // つき1回だけ再フィットする(配色切り替えだけでは再フィットしない)。
        const key = `${selected.id}:pts`;
        if (lastFitKeyRef.current !== key) {
          const felt = resolved
            .filter((p) => p.latitude != null && p.longitude != null)
            .map((p) => [p.longitude, p.latitude]);
          const coords = hasHypo ? [[selected.longitude, selected.latitude], ...felt] : felt;
          if (coords.length > 0) {
            engine.fitQuakeBounds?.(coords);
            lastFitKeyRef.current = key;
          }
        }
      } catch (err) {
        console.error('震度分布の描画に失敗しました:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [selected, colorScheme, engineRef]);

  // Clear the map overlay + hypocenter marker on unmount (panel closed for
  // good / app teardown).
  useEffect(() => () => {
    engineRef?.current?.clearQuakeIntensity?.();
    engineRef?.current?.setSelectedQuakeHypocenter?.(null);
  }, [engineRef]);

  return {
    quakes, loading, error, wsStatus,
    selected, selectedId, selectQuake, back,
    colorScheme, changeColorScheme,
    fetchLimit, changeFetchLimit,
    refresh,
  };
}
