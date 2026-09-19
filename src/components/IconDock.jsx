import PressableButton from './PressableButton.jsx';

// Placeholder vertical icon dock (bottom-left). Icon glyphs and each button's
// actual function are intentionally left unset for now — wire them up once
// that's decided. Each slot currently just logs which slot was tapped.
const SLOT_COUNT = 3;

export default function IconDock() {
  return (
    <div className="icon-dock">
      {Array.from({ length: SLOT_COUNT }).map((_, i) => (
        <PressableButton
          key={i}
          className="icon-dock-btn"
          onClick={() => console.log(`IconDock: slot ${i + 1} tapped (placeholder — no action wired up yet)`)}
          aria-label={`メニュー${i + 1}（未設定）`}
        >
          <span className="icon-dock-dot" />
        </PressableButton>
      ))}
    </div>
  );
}
