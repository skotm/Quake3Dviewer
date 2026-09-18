function formatTime(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StatsPanel({ stats }) {
  const { count, maxMag, latest } = stats;
  return (
    <div className="panel stats">
      <div className="row"><span>表示件数</span><b>{count != null ? count.toLocaleString('ja-JP') : '—'}</b></div>
      <div className="row"><span>最大マグニチュード</span><b>{maxMag != null ? maxMag.toFixed(1) : '—'}</b></div>
      <div className="divider" />
      <div className="row"><span>直近の地震</span><b>{formatTime(latest?.time)}</b></div>
      <div className="latest-place">{latest?.place || '—'}</div>
    </div>
  );
}
