import { useRef, useState, useCallback } from 'react';
import MapView from './components/MapView.jsx';
import Legend from './components/Legend.jsx';
import IconDock from './components/IconDock.jsx';
import Tooltip from './components/Tooltip.jsx';
import StatusOverlay from './components/StatusOverlay.jsx';
import { buildSampleQuakes } from './lib/sampleData.js';
import './App.css';

export default function App() {
  const engineRef = useRef(null);

  const [rangeMode, setRangeMode] = useState('recent'); // 'recent' | 'custom'
  const [days, setDays] = useState(7);
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [customStart, setCustomStart] = useState(weekAgoStr);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [minMag, setMinMag] = useState(2.0);
  const [exaggeration, setExaggeration] = useState(1.5);
  const [showStems, setShowStems] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const [hover, setHover] = useState({ record: null, pos: { x: 0, y: 0 } });
  const [status, setStatus] = useState({ mode: 'loading', message: '読み込み中…' });

  const handleHover = useCallback((record, pos) => {
    setHover({ record, pos: pos || { x: 0, y: 0 } });
  }, []);
  const handleStatus = useCallback((mode, message) => {
    setStatus({ mode, message });
    if (mode === 'warning') {
      setTimeout(() => {
        setStatus((prev) => (prev.mode === 'warning' && prev.message === message ? { mode: 'hidden' } : prev));
      }, 6000);
    }
  }, []);

  const handleRetry = () => setReloadToken((t) => t + 1);
  const handleUseSample = () => engineRef.current?.useSampleData(buildSampleQuakes());
  const handleRefresh = () => setReloadToken((t) => t + 1);

  return (
    <div className="app-root">
      <MapView
        days={days}
        rangeMode={rangeMode}
        customStart={customStart}
        customEnd={customEnd}
        minMag={minMag}
        exaggeration={exaggeration}
        showStems={showStems}
        reloadToken={reloadToken}
        onHover={handleHover}
        onStatus={handleStatus}
        engineRef={engineRef}
      />

      <div className="panel title-block">
        <h1>震源分布 3Dビューア</h1>
        <Legend />
      </div>

      <div className="bottom-right-dock">
        <IconDock
          engineRef={engineRef}
          mapSettings={{
            rangeMode, setRangeMode,
            days, setDays,
            customStart, setCustomStart,
            customEnd, setCustomEnd,
            minMag, setMinMag,
            exaggeration, setExaggeration,
            showStems, setShowStems,
            onRefresh: handleRefresh,
          }}
        />
      </div>
      <Tooltip record={hover.record} pos={hover.pos} />
      <StatusOverlay status={status} onRetry={handleRetry} onUseSample={handleUseSample} />

      <div className="footer-note">
        データ: 気象庁（JMA）震源データ ／ 地図: 提供元GeoJSONデータ（簡略化済み）
      </div>
    </div>
  );
}
