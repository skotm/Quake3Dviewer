import { useState } from 'react';
import PressableButton from './PressableButton.jsx';
import QuakePanel from './quake/QuakePanel.jsx';
import QuakeSearchPanel from './quake/QuakeSearchPanel.jsx';
import { useQuakeFeed } from '../lib/useQuakeFeed.js';
import { useEqdbSearch } from '../lib/useEqdbSearch.js';

// Slot 0 is the earthquake browser, slot 1 is the eqdb search feature
// (both real features); slot 2 is still a placeholder.
const ITEMS = [
  { id: 0, label: '地震' },
  { id: 1, label: '地震検索' },
  { id: 2, label: 'メニュー3' },
];

// Seismograph-trace icon, ported as-is from MeteoQuake's NAV_ICONS.quake.
function QuakeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="2,12 4,12 5,7 6,17 8,4 9,20 11,10 12,12 14,12" />
      <polyline points="14,12 15,9 16,15 18,12 22,12" />
    </svg>
  );
}

// Magnifying-glass icon, ported as-is from MeteoQuake's SearchGlassIcon.
function SearchGlassIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.3" y1="15.3" x2="20.5" y2="20.5" />
    </svg>
  );
}

// Layout geometry, in px. Every position below is derived from these so the
// slide animation (see icon-dock-slot's `transform`) and the container's
// own width/height stay perfectly in sync — no measuring the DOM needed.
const BTN = 40;
const PAD = 8;
const GAP_CLOSED = 4; // vertical gap between stacked buttons, idle
const GAP_OPEN = 8; // horizontal gap between buttons in the top row, open
const CLOSED_WIDTH = BTN + PAD * 2;
const CLOSED_HEIGHT = ITEMS.length * BTN + (ITEMS.length - 1) * GAP_CLOSED + PAD * 2;
const TOPBAR_HEIGHT = BTN + PAD * 2;

// Default (placeholder) slots: small fixed footprint.
const DEFAULT_OPEN_WIDTH = 240;
const DEFAULT_OPEN_HEIGHT = TOPBAR_HEIGHT + 104;

// Earthquake slot: wider (room for the detail card's M/深さ columns) and
// taller in list mode (scrollable) than in detail mode (one card's worth).
const QUAKE_OPEN_WIDTH = 300;
const QUAKE_LIST_HEIGHT = TOPBAR_HEIGHT + 300;
const QUAKE_DETAIL_HEIGHT = TOPBAR_HEIGHT + 210;

// Search slot: same width as the browser (same detail card), but taller
// while showing the form + scrollable results.
const SEARCH_FORM_HEIGHT = TOPBAR_HEIGHT + 380;

function openSizeFor(index, quakeFeed, eqdbSearch) {
  if (index === 0) {
    return {
      width: QUAKE_OPEN_WIDTH,
      height: quakeFeed.selected ? QUAKE_DETAIL_HEIGHT : QUAKE_LIST_HEIGHT,
    };
  }
  if (index === 1) {
    return {
      width: QUAKE_OPEN_WIDTH,
      height: eqdbSearch.selected ? QUAKE_DETAIL_HEIGHT : SEARCH_FORM_HEIGHT,
    };
  }
  return { width: DEFAULT_OPEN_WIDTH, height: DEFAULT_OPEN_HEIGHT };
}

export default function IconDock({ engineRef }) {
  const [active, setActive] = useState(null);
  const open = active != null;
  const toggle = (i) => setActive((cur) => (cur === i ? null : i));

  // Kept mounted (and the WebSocket / map-sync effects live) for the dock's
  // whole lifetime, not just while a slot is open, so both are already
  // current the moment the person opens them.
  const quakeFeed = useQuakeFeed(engineRef);
  const eqdbSearch = useEqdbSearch(engineRef, quakeFeed.colorScheme);

  const { width: openWidth, height: openHeight } = openSizeFor(active ?? 0, quakeFeed, eqdbSearch);

  return (
    <div
      className={`icon-dock ${open ? 'open' : ''}`}
      style={{ width: open ? openWidth : CLOSED_WIDTH, height: open ? openHeight : CLOSED_HEIGHT }}
    >
      {ITEMS.map((item, i) => {
        // Idle: stacked in a column. Open: lined up in a row along the top
        // edge. The wrapper (not the button) carries the translate, so this
        // slide and PressableButton's own press-scale never fight over the
        // same `transform`.
        const x = open ? PAD + i * (BTN + GAP_OPEN) : PAD;
        const y = open ? PAD : PAD + i * (BTN + GAP_CLOSED);
        return (
          <div key={item.id} className="icon-dock-slot" style={{ transform: `translate(${x}px, ${y}px)` }}>
            <PressableButton
              className={`icon-dock-btn ${active === i ? 'active' : ''}`}
              onClick={() => toggle(i)}
              aria-label={item.id === 0 || item.id === 1 ? item.label : `${item.label}（未設定）`}
            >
              {item.id === 0 ? <QuakeIcon /> : item.id === 1 ? <SearchGlassIcon /> : <span className="icon-dock-dot" />}
            </PressableButton>
          </div>
        );
      })}

      <div className="icon-dock-content" style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}>
        {open && active === 0 && <QuakePanel feed={quakeFeed} />}
        {open && active === 1 && <QuakeSearchPanel feed={eqdbSearch} colorScheme={quakeFeed.colorScheme} />}
        {open && active === 2 && (
          <>
            <div className="icon-dock-content-title">{ITEMS[active].label}</div>
            <div className="icon-dock-content-body">まだ中身は未設定です。</div>
          </>
        )}
      </div>
    </div>
  );
}
