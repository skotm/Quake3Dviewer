import { useRef, useState, useCallback } from 'react';
import MapView from './components/MapView.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import Legend from './components/Legend.jsx';
import Tooltip from './components/Tooltip.jsx';
import StatusOverlay from './components/StatusOverlay.jsx';
import { buildSampleQuakes } from './lib/sampleData.js';
import './App.css';

export default function App() {
  const engineRef = useRef(null);

  const [days, setDays] = useState(7);
  const [minMag, setMinMag] = useState(2.0);
  const [exaggeration, setExaggeration] = useState(1.5);
  const [showStems, setShowStems] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [controlsCollapsed, setControlsCollapsed] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 720 : false
  );

  const [stats, setStats] = useState({ count: null, maxMag: null, latest: null });
  const [hover, setHover] = useState({ record: null, pos: { x: 0, y: 0 } });
  const [status, setStatus] = useState({ mode: 'loading', message: '読み込み中…' });

  const handleStats = useCallback((s) => setStats(s), []);
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
        minMag={minMag}
        exaggeration={exaggeration}
        showStems={showStems}
        reloadToken={reloadToken}
        onStats={handleStats}
        onHover={handleHover}
        onStatus={handleStatus}
        engineRef={engineRef}
      />

      <div className="panel title-block">
        <h1>震源分布 3Dビューア</h1>
        <p>日本周辺の地震を震央・深さ・規模で立体表示。ドラッグで回転、スクロールで拡大縮小。</p>
      </div>

      <ControlPanel
        days={days} setDays={setDays}
        minMag={minMag} setMinMag={setMinMag}
        exaggeration={exaggeration} setExaggeration={setExaggeration}
        showStems={showStems} setShowStems={setShowStems}
        onRefresh={handleRefresh}
        collapsed={controlsCollapsed}
        onToggleCollapsed={() => setControlsCollapsed((c) => !c)}
      />

      <StatsPanel stats={stats} />
      <Legend />
      <Tooltip record={hover.record} pos={hover.pos} />
      <StatusOverlay status={status} onRetry={handleRetry} onUseSample={handleUseSample} />

      <div className="footer-note">
        データ: 気象庁（JMA）震源データ ／ 地図: 提供元GeoJSONデータ（簡略化済み）
      </div>
    </div>
  );
}
