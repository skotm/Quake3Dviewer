import PressableButton from '../PressableButton.jsx';
import QuakeListRow from './QuakeListRow.jsx';
import QuakeDetailCard from './QuakeDetailCard.jsx';

export default function QuakeSearchPanel({ feed, colorScheme }) {
  const {
    form, patch, minStartDate, maxEndDate, epicenterOptions,
    status, isSearching, hasSearched, results,
    search: runSearch, loadingId, selectResult, selected, back,
  } = feed;

  if (selected) {
    return (
      <div className="quake-panel">
        <div className="quake-panel-header">
          <PressableButton className="quake-back-btn" onClick={back} aria-label="検索結果へ戻る">‹</PressableButton>
          <span className="quake-panel-title">地震検索</span>
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
        <span className="quake-panel-title">地震検索</span>
      </div>

      <div className="quake-panel-scroll">
        <div className="quake-search-form">
          <div className="quake-search-row quake-search-row-dates">
            <label className="quake-field">
              <span className="quake-field-label">開始日</span>
              <input
                type="date"
                className="quake-field-input"
                value={form.startDate}
                min={minStartDate}
                max={form.endDate || maxEndDate}
                onChange={(e) => patch({ startDate: e.target.value < minStartDate ? minStartDate : e.target.value })}
              />
            </label>
            <label className="quake-field">
              <span className="quake-field-label">終了日</span>
              <input
                type="date"
                className="quake-field-input"
                value={form.endDate}
                min={form.startDate || minStartDate}
                max={maxEndDate}
                onChange={(e) => patch({ endDate: e.target.value > maxEndDate ? maxEndDate : e.target.value })}
              />
            </label>
          </div>

          <div className="quake-search-row">
            <label className="quake-field">
              <span className="quake-field-label">最小M</span>
              <select className="quake-field-input" value={form.minMag} onChange={(e) => patch({ minMag: e.target.value })}>
                {['0.0', '1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0', '8.0'].map((v) => (
                  <option key={v} value={v}>{v === '0.0' ? '指定なし' : `M${v}以上`}</option>
                ))}
              </select>
            </label>
            <label className="quake-field">
              <span className="quake-field-label">最大震度</span>
              <select className="quake-field-input" value={form.maxInt} onChange={(e) => patch({ maxInt: e.target.value })}>
                <option value="1">指定なし</option>
                <option value="2">震度2以上</option>
                <option value="3">震度3以上</option>
                <option value="4">震度4以上</option>
                <option value="A">震度5弱以上</option>
                <option value="B">震度5強以上</option>
                <option value="C">震度6弱以上</option>
                <option value="D">震度6強以上</option>
                <option value="7">震度7</option>
              </select>
            </label>
          </div>

          <div className="quake-search-row">
            <label className="quake-field">
              <span className="quake-field-label">並び順</span>
              <select className="quake-field-input" value={form.sort} onChange={(e) => patch({ sort: e.target.value })}>
                <option value="S0">新しい順</option>
                <option value="S1">古い順</option>
                <option value="S2">最大震度順</option>
                <option value="S3">規模順</option>
              </select>
            </label>
            <label className="quake-field">
              <span className="quake-field-label">震源地名</span>
              <select className="quake-field-input" value={form.epicenterName} onChange={(e) => patch({ epicenterName: e.target.value })}>
                {epicenterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          <PressableButton className="quake-search-btn" onClick={runSearch} disabled={isSearching}>
            {isSearching ? '検索中…' : '検索'}
          </PressableButton>

          {status !== '' && <div className="quake-status-text quake-search-status">{status}</div>}
        </div>

        {!hasSearched ? (
          <div className="quake-status-text">条件を指定して検索してください</div>
        ) : results.length === 0 ? (
          !isSearching && <div className="quake-status-text">該当する地震が見つかりませんでした</div>
        ) : (
          results.map((item, i) => (
            <div key={item.raw.id}>
              {i > 0 && <div className="quake-row-divider" />}
              <QuakeListRow
                quake={item.preview}
                colorScheme={colorScheme}
                onSelect={() => selectResult(item.raw)}
                loading={loadingId === item.raw.id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
