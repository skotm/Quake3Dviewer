import PressableButton from './PressableButton.jsx';

// Placeholder vertical icon dock (bottom-right). Icon glyphs and each
// button's actual function are intentionally left unset for now — wire them
// up once that's decided. Tapping a slot toggles its expanding panel
// (see DockPanel.jsx), driven by the parent via activeSlot/onToggleSlot.
const SLOT_COUNT = 3;

export default function IconDock({ activeSlot, onToggleSlot }) {
  return (
    <div className="icon-dock">
      {Array.from({ length: SLOT_COUNT }).map((_, i) => (
        <PressableButton
          key={i}
          className={`icon-dock-btn ${activeSlot === i ? 'active' : ''}`}
          onClick={() => onToggleSlot(i)}
          aria-label={`メニュー${i + 1}（未設定）`}
        >
          <span className="icon-dock-dot" />
        </PressableButton>
      ))}
    </div>
  );
}
