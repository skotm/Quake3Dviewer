import PressableButton from '../PressableButton.jsx';
import { contrastTextColor } from '../../lib/volcanoIcons.js';
import { formatVolcanoTimeShort } from '../../lib/volcanoAlerts.js';

export default function VolcanoListRow({ volcano, onSelect }) {
  const hasData = volcano.alertCode != null;
  const bg = hasData ? volcano.color : '#3a3a3c';
  const fg = hasData ? contrastTextColor(bg) : 'rgba(255,255,255,0.6)';
  const badgeText = hasData ? (volcano.badgeLabel || '?') : '-';

  return (
    <PressableButton className="quake-row" onClick={onSelect}>
      <span
        className="quake-row-badge"
        style={{ background: bg, color: fg, fontSize: badgeText.length > 1 ? 9.5 : 12 }}
      >
        {badgeText}
      </span>
      <span className="quake-row-main">
        <span className="quake-row-place">{volcano.name}</span>
      </span>
      <span className="quake-row-time">
        {hasData ? formatVolcanoTimeShort(volcano.reportDatetime) : '情報なし'}
      </span>
    </PressableButton>
  );
}
