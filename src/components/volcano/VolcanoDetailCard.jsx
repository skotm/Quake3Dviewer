import { contrastTextColor } from '../../lib/volcanoIcons.js';
import { formatVolcanoDateTime } from '../../lib/volcanoAlerts.js';

export default function VolcanoDetailCard({ volcano }) {
  const hasData = volcano.alertCode != null;
  const bg = hasData ? volcano.color : '#3a3a3c';
  const fg = hasData ? contrastTextColor(bg) : 'rgba(255,255,255,0.6)';

  return (
    <div className="quake-detail">
      <div className="quake-detail-top">
        <div className="quake-detail-badge-col">
          <span className="quake-detail-badge-label">警戒状況</span>
          <div className="quake-detail-badge" style={{ background: bg, color: fg }}>
            <span className="quake-detail-badge-text" style={{ fontSize: hasData ? undefined : 13 }}>
              {hasData ? (volcano.badgeLabel || '？') : '情報なし'}
            </span>
          </div>
        </div>

        <div className="quake-detail-info">
          <div className="quake-detail-place-row">
            <span className="quake-detail-label">火山名</span>
            <span className="quake-detail-place">{volcano.name}</span>
          </div>
          <div className="quake-detail-row">
            <span className="quake-detail-label">
              状況<b className="quake-detail-val">{hasData ? volcano.alertLabel : '観測情報なし'}</b>
            </span>
          </div>
          {volcano.reportDatetime && (
            <div className="quake-detail-row">
              <span className="quake-detail-label">発表時刻</span>
              <b className="quake-detail-time">{formatVolcanoDateTime(volcano.reportDatetime)}</b>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
