import PressableButton from './PressableButton.jsx';

export default function StatusOverlay({ status, onRetry, onUseSample }) {
  if (status.mode === 'hidden') return null;

  const isWarningToast = status.mode === 'warning';

  if (isWarningToast) {
    return <div className="warning-toast">{status.message}</div>;
  }

  return (
    <div className="status-overlay">
      {status.mode === 'loading' && <div className="spinner" />}
      <div className="status-text">{status.message}</div>
      {(status.mode === 'error' || status.mode === 'error-map') && (
        <div className="status-actions">
          <PressableButton className="btn primary" onClick={onRetry}>再試行</PressableButton>
          {status.mode === 'error' && (
            <PressableButton className="btn" onClick={onUseSample}>サンプルで表示</PressableButton>
          )}
        </div>
      )}
    </div>
  );
}
