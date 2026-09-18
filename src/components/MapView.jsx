import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { QuakeMapEngine } from '../lib/QuakeMapEngine.js';
import { loadRecentQuakes } from '../lib/jma.js';
import { buildSampleQuakes } from '../lib/sampleData.js';

export default function MapView({ days, minMag, exaggeration, showStems, reloadToken, onStats, onHover, onStatus, engineRef }) {
  const containerRef = useRef(null);
  const localEngineRef = useRef(null);

  // Create the engine once.
  useEffect(() => {
    const engine = new QuakeMapEngine(containerRef.current, { onStats, onHover, onStatus });
    localEngineRef.current = engine;
    if (engineRef) engineRef.current = engine;

    engine.init().then(() => {
      if (engine.ready) {
        engine.loadRange(days, loadRecentQuakes).catch(() => {});
      }
    });

    return () => engine.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when the requested date range changes (or an explicit refresh is requested).
  useEffect(() => {
    const engine = localEngineRef.current;
    if (!engine || !engine.scene) return;
    engine.loadRange(days, loadRecentQuakes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, reloadToken]);

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
