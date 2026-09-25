import { useCallback, useEffect, useRef, useState } from 'react';
import { loadVolcanoList } from './volcanoData.js';
import { fetchVolcanoAlerts, getVolcanoAlertMeta, getVolcanoAlertColor, getVolcanoAlertRank } from './volcanoAlerts.js';
import { volcanoIconIdForCode } from './volcanoIcons.js';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10分間隔ポーリング

function buildVolcanoList(volcanoList, alertsByCode) {
  const items = (volcanoList || []).map((v) => {
    const alert = alertsByCode.get(v.code) || null;
    const alertCode = alert?.code ?? null;
    const meta = getVolcanoAlertMeta(alertCode);
    return {
      code: v.code,
      name: v.name_jp,
      nameEn: v.name_en,
      lat: parseFloat(v.latlon?.[0]),
      lon: parseFloat(v.latlon?.[1]),
      levelOperation: !!v.levelOperation,
      alertCode,
      alertLabel: meta?.label || alert?.name || null,
      badgeLabel: meta?.short || null,
      reportDatetime: alert?.reportDatetime || null,
      condition: alert?.condition || null,
      iconId: volcanoIconIdForCode(alertCode, !!v.levelOperation),
      color: alertCode != null ? getVolcanoAlertColor(alertCode) : null,
      rank: getVolcanoAlertRank(alertCode),
    };
  });
  // 警戒度が高い順。同ランクは五十音順で安定させる。
  items.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'ja'));
  return items;
}

/**
 * engineRef: MapView側のQuakeMapEngineインスタンスへのref。
 * visible: 火山情報タブが「割り当てられている」かどうか(activeTab===3)。
 *          フローティングパネル自体の開閉(open)とは独立していて、閉じても
 *          このタブが割り当てられたままなら地図上のマーカーは消さない。
 *          別のタブが選ばれた時だけマーカーを消す。
 *
 * データ取得はタブの開閉に関係なく、マウント時から10分間隔で継続する
 * （タブを開くたびに取得し直すことはしない）。
 */
export function useVolcanoFeed(engineRef, visible) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);

  const volcanoListRef = useRef(null);
  const reloadTokenRef = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const refresh = useCallback(async () => {
    const token = ++reloadTokenRef.current;
    try {
      if (!volcanoListRef.current) {
        volcanoListRef.current = await loadVolcanoList();
      }
      const alertsByCode = await fetchVolcanoAlerts();
      if (reloadTokenRef.current !== token) return;
      const built = buildVolcanoList(volcanoListRef.current, alertsByCode);
      setItems(built);
      setError(null);
      // 取得結果の地図反映は、その時点でタブが開いている場合のみ。
      if (visibleRef.current) engineRef?.current?.setVolcanoMarkers?.(built);
    } catch (err) {
      if (reloadTokenRef.current !== token) return;
      console.error(err);
      setError('火山情報の取得に失敗しました。');
    } finally {
      if (reloadTokenRef.current === token) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 取得は開閉に関わらずマウント時から10分間隔で継続する。
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // タブの開閉だけで地図上のマーカーの表示/非表示を切り替える（再取得はしない）。
  useEffect(() => {
    if (visible) {
      engineRef?.current?.setVolcanoMarkers?.(itemsRef.current);
    } else {
      engineRef?.current?.setVolcanoMarkers?.([]);
    }
  }, [visible, engineRef]);

  const selectVolcano = useCallback((code) => {
    setSelectedCode(code);
  }, []);
  const back = useCallback(() => setSelectedCode(null), []);

  const selected = selectedCode != null ? items.find((it) => it.code === selectedCode) || null : null;

  // 一覧で選んだ火山へ地図を寄せ、詳細ポップアップを開く。
  useEffect(() => {
    if (selected) engineRef?.current?.flyToVolcano?.(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCode]);

  return { items, loading, error, refresh, selected, selectVolcano, back };
}
