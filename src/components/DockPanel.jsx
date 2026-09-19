// Content is a placeholder until each dock slot's actual feature is decided.
const PLACEHOLDER_TITLES = ['メニュー1', 'メニュー2', 'メニュー3'];

export default function DockPanel({ activeSlot, onClose }) {
  const open = activeSlot != null;
  return (
    <div className={`panel dock-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
      {open && (
        <>
          <div className="dock-panel-header">
            <span>{PLACEHOLDER_TITLES[activeSlot] ?? 'メニュー'}</span>
            <button className="dock-panel-close" onClick={onClose} aria-label="閉じる">✕</button>
          </div>
          <div className="dock-panel-body">
            まだ中身は未設定です。
          </div>
        </>
      )}
    </div>
  );
}
