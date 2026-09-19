import { useState } from 'react';

// Placeholder items — swap labels/onSelect behavior in once each feature is
// decided. Selecting an item currently just closes the menu.
const ITEMS = [
  { id: 'slot1', label: 'メニュー1' },
  { id: 'slot2', label: 'メニュー2' },
  { id: 'slot3', label: 'メニュー3' },
];

const BUTTON_SIZE = 44; // closed: diameter of the circular toggle
const BUTTON_SIZE_OPEN = 34; // open: the toggle shrinks a little, same idea as the reference
const WIDTH_OPEN = 176;
const ITEM_HEIGHT = 34;
const ITEM_GAP = 6;
const PAD = 8;

export default function FloatingMenu() {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);

  const itemsBlockHeight = ITEMS.length * ITEM_HEIGHT + Math.max(0, ITEMS.length - 1) * ITEM_GAP + PAD * 2;
  const width = open ? WIDTH_OPEN : BUTTON_SIZE;
  const height = open ? BUTTON_SIZE_OPEN + itemsBlockHeight : BUTTON_SIZE;

  return (
    <div
      className="floating-menu"
      style={{
        width,
        height,
        borderRadius: open ? 20 : 999,
      }}
    >
      {/* column-reverse: the toggle button stays anchored at the bottom-right
          corner and the item list grows upward above it, so the whole shape
          reads as "emerging from" that corner rather than jumping in. */}
      <div className="floating-menu-stack">
        {open && (
          <div className="floating-menu-items">
            {ITEMS.map((item) => (
              <button key={item.id} className="floating-menu-item" onClick={() => setOpen(false)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="floating-menu-toggle-row">
          <button
            className="floating-menu-toggle"
            onClick={() => setOpen((o) => !o)}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
            style={{ transform: pressed ? 'scale(1.06)' : 'scale(1)' }}
          >
            <svg
              viewBox="0 0 24 24" width="18" height="18" fill="none"
              stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
