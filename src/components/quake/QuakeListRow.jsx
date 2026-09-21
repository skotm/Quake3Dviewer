import PressableButton from '../PressableButton.jsx';
import { getIntensityStyle, QUAKE_STAGE_LABEL } from '../../lib/quakeFeed.js';

export default function QuakeListRow({ quake, colorScheme, onSelect }) {
  const style = getIntensityStyle(colorScheme, quake.maxIntensity || '1');
  const badgeText = quake.isForeign ? '遠地' : quake.maxIntensity === '?' ? '調査中' : quake.maxIntensity === '5u' ? '未入電' : style.label;

  return (
    <PressableButton className="quake-row" onClick={onSelect}>
      <span
        className="quake-row-badge"
        style={{ background: style.bg, color: style.fg, fontSize: badgeText.length > 2 ? 8.5 : 11 }}
      >
        {badgeText}
      </span>
      <span className="quake-row-main">
        {QUAKE_STAGE_LABEL[quake.stage] && <span className="quake-row-stage">{QUAKE_STAGE_LABEL[quake.stage]}</span>}
        <span className="quake-row-place">{quake.place}</span>
      </span>
      <span className="quake-row-time">{quake.time?.slice(5, 16)}</span>
    </PressableButton>
  );
}
