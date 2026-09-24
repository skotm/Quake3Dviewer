import PressableButton from '../PressableButton.jsx';
import VolcanoListRow from './VolcanoListRow.jsx';
import VolcanoDetailCard from './VolcanoDetailCard.jsx';

export default function VolcanoPanel({ feed }) {
  const { items, loading, error, selected, selectVolcano, back, refresh } = feed;

  if (selected) {
    return (
      <div className="quake-panel">
        <div className="quake-panel-header">
          <PressableButton className="quake-back-btn" onClick={back} aria-label="一覧へ戻る">‹</PressableButton>
          <span className="quake-panel-title">火山情報</span>
        </div>
        <div className="quake-panel-scroll">
          <VolcanoDetailCard volcano={selected} />
        </div>
      </div>
    );
  }

  return (
    <div className="quake-panel">
      <div className="quake-panel-header">
        <span className="quake-panel-title">火山情報</span>
      </div>

      <div className="quake-panel-scroll">
        {loading && items.length === 0 && <div className="quake-status-text">読み込み中…</div>}
        {error && (
          <div className="quake-status-text">
            {error}
            <PressableButton className="quake-retry-btn" onClick={refresh}>再試行</PressableButton>
          </div>
        )}
        {items.map((v, i) => (
          <div key={v.code}>
            {i > 0 && <div className="quake-row-divider" />}
            <VolcanoListRow volcano={v} onSelect={() => selectVolcano(v.code)} />
          </div>
        ))}
      </div>
    </div>
  );
}
