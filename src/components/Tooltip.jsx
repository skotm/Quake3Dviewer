export default function Tooltip({ record, pos }) {
  if (!record) return null;
  const dt = record.time != null ? new Date(record.time) : null;
  return (
    <div
      className="tooltip"
      style={{ left: pos.x + 14, top: pos.y + 14 }}
    >
      <div className="t-place">{record.place || '不明な地点'}</div>
      <div className="t-row">
        <span>日時</span>
        <b>{dt ? dt.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</b>
      </div>
      <div className="t-row"><span>マグニチュード</span><b>{Number.isFinite(record.mag) ? record.mag.toFixed(1) : '—'}</b></div>
      <div className="t-row"><span>深さ</span><b>{Number.isFinite(record.depth) ? `${Math.round(record.depth)} km` : '—'}</b></div>
      {record.intensity ? <div className="t-row"><span>最大震度</span><b>{record.intensity}</b></div> : null}
    </div>
  );
}
