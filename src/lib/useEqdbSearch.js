import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchEqdbSearch, fetchEqdbEventCached, buildEqdbQuakeCard,
  eqdbListItemToPreview, filterAndSortEqdbResults, loadEpicenterNameOptions,
  loadEqdbDateRange, defaultEqdbDateRange, eqdbMaxEndDate, EQDB_MIN_DATE,
} from './eqdb.js';
import { syncQuakeToMap } from './quakeMapSync.js';

const initialRange = defaultEqdbDateRange();

/**
 * engineRef: shared QuakeMapEngine ref (same one useQuakeFeed uses).
 * colorScheme: shared with the recent-list feed, so a selected search
 * result paints in the same palette the person already picked.
 */
export function useEqdbSearch(engineRef, colorScheme) {
  const [form, setForm] = useState({
    startDate: initialRange.start,
    endDate: initialRange.end,
    minMag: '0.0',
    maxInt: '1',
    sort: 'S0',
    epicenterName: '',
  });
  const [minStartDate, setMinStartDate] = useState(EQDB_MIN_DATE);
  const [maxEndDate, setMaxEndDate] = useState(initialRange.end);
  const [epicenterOptions, setEpicenterOptions] = useState([{ value: '', label: '指定なし' }]);

  const [status, setStatus] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState([]);

  const [loadingId, setLoadingId] = useState(null);
  const [selected, setSelected] = useState(null); // full card, once a result is opened

  // 実際の収録期間(date.json)が分かり次第、フォームのmin/maxを合わせる。
  useEffect(() => {
    let cancelled = false;
    loadEqdbDateRange()
      .then((range) => {
        if (cancelled || !range) return;
        setMinStartDate(range.st || EQDB_MIN_DATE);
        const realMax = eqdbMaxEndDate(range.en);
        setMaxEndDate(realMax);
        setForm((prev) => {
          let next = prev;
          if (prev.endDate > realMax) next = { ...next, endDate: realMax };
          if (next.startDate < (range.st || EQDB_MIN_DATE)) next = { ...next, startDate: range.st || EQDB_MIN_DATE };
          return next;
        });
      })
      .catch((err) => console.error('震度データベースの収録期間の取得に失敗しました:', err));
    return () => { cancelled = true; };
  }, []);

  // 震源地名プルダウン(ep.json由来、遅延読み込み)。
  useEffect(() => {
    let cancelled = false;
    loadEpicenterNameOptions()
      .then((opts) => { if (!cancelled) setEpicenterOptions(opts); })
      .catch((err) => console.error('震央地名データの読み込みに失敗しました:', err));
    return () => { cancelled = true; };
  }, []);

  const patch = useCallback((p) => setForm((prev) => ({ ...prev, ...p })), []);

  const search = useCallback(async () => {
    if (isSearching) return;
    let effectiveEnd = form.endDate > maxEndDate ? maxEndDate : form.endDate;
    let effectiveStart = form.startDate > effectiveEnd ? effectiveEnd : form.startDate;
    if (effectiveStart < minStartDate) effectiveStart = minStartDate;
    if (!effectiveStart || !effectiveEnd) {
      setStatus('開始日・終了日を指定してください');
      return;
    }

    patch({ startDate: effectiveStart, endDate: effectiveEnd });
    setIsSearching(true);
    setHasSearched(true);
    setStatus('気象庁 震度データベースを検索中…');
    try {
      const minMagNum = parseFloat(form.minMag) || 0;
      const { list, errMsg, summary } = await fetchEqdbSearch({
        startDate: effectiveStart, endDate: effectiveEnd,
        minMag: minMagNum, maxInt: form.maxInt, sort: form.sort,
        epi: form.epicenterName || undefined,
      });
      if (errMsg) {
        setStatus(`⚠ ${errMsg}`);
        setResults([]);
        return;
      }
      const filtered = filterAndSortEqdbResults(list, {
        minMagNum, maxInt: form.maxInt, epicenterName: form.epicenterName, sort: form.sort,
      });
      setResults(filtered);
      setStatus(filtered.length !== list.length ? `${filtered.length}件（取得${list.length}件から絞り込み）` : summary || `${filtered.length}件`);
    } catch (err) {
      setStatus(`検索中にエラーが発生しました: ${err.message}`);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [form, isSearching, maxEndDate, minStartDate, patch]);

  const selectResult = useCallback(async (eq) => {
    if (loadingId) return;
    setLoadingId(eq.id);
    setStatus(`「${eq.name}」の震度データを取得中…`);
    try {
      const detail = await fetchEqdbEventCached(eq.id);
      if (!detail) {
        setStatus('詳細データの取得に失敗しました');
        return;
      }
      const card = buildEqdbQuakeCard(detail, eq);
      setSelected(card);
      setStatus('');
    } catch (err) {
      setStatus(`詳細データの取得に失敗しました: ${err.message}`);
    } finally {
      setLoadingId(null);
    }
  }, [loadingId]);

  const back = useCallback(() => setSelected(null), []);

  const resultItems = results.map((eq) => ({ raw: eq, preview: eqdbListItemToPreview(eq) }));

  // 独自のfitKeyRef(recent一覧側と別)を持つので、どちらのパネルで地震を
  // 選んでも地図は正しく最新の選択に追従しつつ、互いのカメラフィット済み
  // 判定を踏み潰さない。
  const fitKeyRef = useRef(null);
  useEffect(() => {
    const engine = engineRef?.current;
    if (!engine) return;
    const cancelToken = { cancelled: false };
    syncQuakeToMap(engine, selected, colorScheme, fitKeyRef, cancelToken).catch((err) => {
      console.error('震度分布の描画に失敗しました:', err);
    });
    return () => { cancelToken.cancelled = true; };
  }, [selected, colorScheme, engineRef]);

  return {
    form, patch, minStartDate, maxEndDate, epicenterOptions,
    status, isSearching, hasSearched, results: resultItems,
    search, loadingId, selectResult, selected, back,
  };
}
