import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { QuakeMapEngine } from '../lib/QuakeMapEngine.js';
import { loadRecentQuakes, loadQuakesForRange } from '../lib/jma.js';
import { buildSampleQuakes } from '../lib/sampleData.js';

function buildLoader({ rangeMode, days, customStart, customEnd }) {
  if (rangeMode === 'custom' && customStart && customEnd) {
    return () => loadQuakesForRange(customStart, customEnd);
  }
  return () => loadRecentQuakes(days);
}

export default function MapView({
  days, rangeMode, customStart, customEnd,
  minMag, exaggeration, showStems, reloadToken,
  onStats, onHover, onStatus, engineRef,
}) {
  const containerRef = useRef(null);
  const localEngineRef = useRef(null);

  // Create the engine once.
  useEffect(() => {
    const engine = new QuakeMapEngine(containerRef.current, { onStats, onHover, onStatus });
    localEngineRef.current = engine;
    if (engineRef) engineRef.current = engine;

    engine.init().then(() => {
      if (engine.ready) {
        engine.loadQuakes(buildLoader({ rangeMode, days, customStart, customEnd })).catch(() => {});
      }
    });

    return () => engine.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when the requested period changes (or an explicit refresh is requested).
  useEffect(() => {
    const engine = localEngineRef.current;
    if (!engine || !engine.scene) return;
    // In custom mode, wait until both dates are actually filled in.
    if (rangeMode === 'custom' && (!customStart || !customEnd)) return;
    engine.loadQuakes(buildLoader({ rangeMode, days, customStart, customEnd })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, rangeMode, customStart, customEnd, reloadToken]);

  useEffect(() => {
    localEngineRef.current?.setMinMag(minMag);
  }, [minMag]);

  useEffect(() => {
    localEngineRef.current?.setExaggeration(exaggeration);
  }, [exaggeration]);

  useEffect(() => {
    localEngineRef.current?.setShowStems(showStems);
  }, [showStems]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

export function useSampleFallback(engineRef) {
  return () => engineRef.current?.useSampleData(buildSampleQuakes());
}
