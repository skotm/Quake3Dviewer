import PressableButton from './PressableButton.jsx';
import Toggle from './Toggle.jsx';

const RANGE_OPTIONS = [
  { days: 1, label: '1日' },
  { days: 3, label: '3日' },
  { days: 7, label: '7日' },
  { days: 30, label: '30日' },
  { days: 90, label: '90日' },
];

export default function ControlPanel({
  days, setDays,
  minMag, setMinMag,
  exaggeration, setExaggeration,
  showStems, setShowStems,
  onRefresh,
  collapsed, onToggleCollapsed,
}) {
  return (
    <>
      <PressableButton className="toggle-controls" onClick={onToggleCollapsed} aria-label="設定を開閉">⚙</PressableButton>
      <div className={`panel controls ${collapsed ? 'collapsed' : ''}`}>
        <div className="ctrl-group">
          <div className="ctrl-label">期間</div>
          <div className="btn-row">
            {RANGE_OPTIONS.map((opt) => (
              <PressableButton
                key={opt.days}
                className={`btn ${days === opt.days ? 'active' : ''}`}
                onClick={() => setDays(opt.days)}
              >
                {opt.label}
              </PressableButton>
            ))}
          </div>
        </div>

        <div className="ctrl-group">
          <div className="ctrl-label">
            最小マグニチュード <span className="val">{minMag.toFixed(1)}</span>
          </div>
          <input
            type="range" min="0" max="6" step="0.5"
            value={minMag}
            onChange={(e) => setMinMag(parseFloat(e.target.value))}
          />
        </div>

        <div className="ctrl-group">
          <div className="ctrl-label">
            深さ方向の強調 <span className="val">{exaggeration.toFixed(1)}×</span>
          </div>
          <input
            type="range" min="0.5" max="4" step="0.5"
            value={exaggeration}
            onChange={(e) => setExaggeration(parseFloat(e.target.value))}
          />
        </div>

        <div className="ctrl-group">
          <div className="checkbox-row" onClick={() => setShowStems(!showStems)}>
            <Toggle on={showStems} onChange={() => setShowStems(!showStems)} />
            地表への引き出し線
          </div>
        </div>

        <div className="ctrl-group">
          <PressableButton className="btn primary" onClick={onRefresh}>最新データを取得</PressableButton>
        </div>
      </div>
    </>
  );
}
