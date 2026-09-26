import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRecentQuakes, connectQuakeWebSocket, mergeQuakeCards,
  loadStoredQuakeColorScheme, saveQuakeColorScheme,
  loadStoredQuakeFetchLimit, saveQuakeFetchLimit,
} from './quakeFeed.js';
import { syncQuakeToMap } from './quakeMapSync.js';

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
 * active: whether this panel's own dock tab (地震一覧) is the currently
 * assigned tab. The felt-area overlay + hypocenter marker are only drawn
 * while true — switching to another tab hides them (selection itself is
 * kept, so switching back restores the same view without re-fetching).
 */
export function useQuakeFeed(engineRef, active) {
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
  // selected quake. See quakeMapSync.js — shared with the eqdb search
  // panel's own hook so both drive the same map engine consistently.
  const fitKeyRef = useRef(null);

  useEffect(() => {
    const engine = engineRef?.current;
    if (!engine) return;
    if (!active) {
      // 他のタブに切り替わっている間は観測点・震度分布を地図から消す
      // (選択状態自体はここでは変えないので、戻ってくれば再取得なしで復元する)。
      engine.clearQuakeIntensity?.();
      engine.setSelectedQuakeHypocenter?.(null);
      return undefined;
    }
    const cancelToken = { cancelled: false };
    syncQuakeToMap(engine, selected, colorScheme, fitKeyRef, cancelToken).catch((err) => {
      console.error('震度分布の描画に失敗しました:', err);
    });
    return () => { cancelToken.cancelled = true; };
  }, [selected, colorScheme, engineRef, active]);

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
