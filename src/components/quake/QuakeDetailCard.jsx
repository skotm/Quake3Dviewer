import { getIntensityStyle, splitIntensityLabel, formatQuakeTimeShort, QUAKE_STAGE_LABEL, buildQuakeMessage } from '../../lib/quakeFeed.js';

export default function QuakeDetailCard({ quake, colorScheme }) {
  const style = getIntensityStyle(colorScheme, quake.maxIntensity || '1');
  const { num, suffix } = splitIntensityLabel(style.label);
  const lines = buildQuakeMessage(quake);

  return (
    <div className="quake-detail">
      <div className="quake-detail-top">
        <div className="quake-detail-badge-col">
          <span className="quake-detail-badge-label">{quake.isForeign ? '遠地地震' : '最大震度'}</span>
          <div className="quake-detail-badge" style={{ background: style.bg, color: style.fg }}>
            {quake.isForeign ? (
              <span className="quake-detail-badge-text">不明</span>
            ) : quake.maxIntensity === '?' ? (
              <span className="quake-detail-badge-text">調査中</span>
            ) : quake.maxIntensity === '5u' ? (
              <div className="quake-detail-badge-5u">
                <span className="quake-detail-badge-num">5弱+</span>
                <span className="quake-detail-badge-sub">未入電</span>
              </div>
            ) : suffix ? (
              <>
                <span className="quake-detail-badge-num">{num}</span>
                <span className="quake-detail-badge-suffix">{suffix}</span>
              </>
            ) : (
              <span className="quake-detail-badge-num">{num}</span>
            )}
          </div>
        </div>

        <div className="quake-detail-info">
          <div className="quake-detail-place-row">
            {QUAKE_STAGE_LABEL[quake.stage] ? (
              <span className="quake-detail-stage">{QUAKE_STAGE_LABEL[quake.stage]}</span>
            ) : (
              <span className="quake-detail-label">震源地</span>
            )}
            <span className="quake-detail-place">{quake.place}</span>
          </div>
          <div className="quake-detail-row">
            <span className="quake-detail-label">M<b className="quake-detail-val">{quake.magnitude != null ? quake.magnitude.toFixed(1) : '-'}</b></span>
            <span className="quake-detail-label">深さ<b className="quake-detail-val">{quake.depth != null ? (quake.depth === 0 ? 'ごく浅い' : `${quake.depth}km`) : '-'}</b></span>
          </div>
          <div className="quake-detail-row">
            <span className="quake-detail-label">発生時刻</span>
            <b className="quake-detail-time">{formatQuakeTimeShort(quake.time)}</b>
          </div>
        </div>
      </div>

      <div className="quake-message">
        {lines.map((line, i) => (
          <div key={i} className="quake-message-line">
            <span className="quake-message-label">{line.label}</span>
            <span className="quake-message-text" style={line.color ? { color: line.color } : undefined}>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
