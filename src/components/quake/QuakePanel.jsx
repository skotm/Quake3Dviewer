import PressableButton from '../PressableButton.jsx';
import QuakeListRow from './QuakeListRow.jsx';
import QuakeDetailCard from './QuakeDetailCard.jsx';
import { QUAKE_COLOR_SCHEMES } from '../../lib/quakeFeed.js';

export default function QuakePanel({ feed }) {
  const { quakes, loading, error, selected, selectQuake, back, colorScheme, changeColorScheme, wsStatus, refresh } = feed;

  if (selected) {
    return (
      <div className="quake-panel">
        <div className="quake-panel-header">
          <PressableButton className="quake-back-btn" onClick={back} aria-label="一覧へ戻る">‹</PressableButton>
          <span className="quake-panel-title">地震情報</span>
        </div>
        <div className="quake-panel-scroll">
          <QuakeDetailCard quake={selected} colorScheme={colorScheme} />
        </div>
      </div>
    );
  }

  return (
    <div className="quake-panel">
      <div className="quake-panel-header">
        <span className="quake-panel-title">地震情報</span>
        <span className={`quake-ws-dot ${wsStatus === 'open' ? 'live' : ''}`} title={wsStatus === 'open' ? 'リアルタイム更新中' : '再接続中'} />
        <div className="quake-scheme-picker">
          {Object.values(QUAKE_COLOR_SCHEMES).map((scheme) => (
            <PressableButton
              key={scheme.id}
              className={`quake-scheme-dot ${colorScheme === scheme.id ? 'active' : ''}`}
              style={{ background: scheme.colors['5+'].bg }}
              onClick={() => changeColorScheme(scheme.id)}
              aria-label={scheme.label}
            />
          ))}
        </div>
      </div>

      <div className="quake-panel-scroll">
        {loading && quakes.length === 0 && <div className="quake-status-text">読み込み中…</div>}
        {error && (
          <div className="quake-status-text">
            {error}
            <PressableButton className="quake-retry-btn" onClick={refresh}>再試行</PressableButton>
          </div>
        )}
        {!loading && !error && quakes.length === 0 && <div className="quake-status-text">直近の地震情報はありません。</div>}
        {quakes.map((q, i) => (
          <div key={q.id}>
            {i > 0 && <div className="quake-row-divider" />}
            <QuakeListRow quake={q} colorScheme={colorScheme} onSelect={() => selectQuake(q.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
