import { useState } from 'react';
import PressableButton from './PressableButton.jsx';

// Placeholder items — swap labels/content in once each slot's actual
// feature is decided.
const ITEMS = [
  { id: 0, label: 'メニュー1' },
  { id: 1, label: 'メニュー2' },
  { id: 2, label: 'メニュー3' },
];

const CONTENT_HEIGHT = 120; // px the pill grows by when a slot is open

export default function IconDock() {
  const [active, setActive] = useState(null);
  const toggle = (i) => setActive((cur) => (cur === i ? null : i));

  return (
    <div className="icon-dock">
      <div className="icon-dock-buttons">
        {ITEMS.map((item, i) => (
          <PressableButton
            key={item.id}
            className={`icon-dock-btn ${active === i ? 'active' : ''}`}
            onClick={() => toggle(i)}
            aria-label={`${item.label}（未設定）`}
          >
            <span className="icon-dock-dot" />
          </PressableButton>
        ))}
      </div>
      <div className="icon-dock-content" style={{ height: active != null ? CONTENT_HEIGHT : 0 }}>
        {active != null && (
          <div className="icon-dock-content-inner">
            <div className="icon-dock-content-title">{ITEMS[active].label}</div>
            <div className="icon-dock-content-body">まだ中身は未設定です。</div>
          </div>
        )}
      </div>
    </div>
  );
}
