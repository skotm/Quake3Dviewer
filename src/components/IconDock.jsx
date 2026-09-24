import { useState } from 'react';
import PressableButton from './PressableButton.jsx';
import QuakePanel from './quake/QuakePanel.jsx';
import QuakeSearchPanel from './quake/QuakeSearchPanel.jsx';
import MapSettingsPanel from './MapSettingsPanel.jsx';
import VolcanoPanel from './volcano/VolcanoPanel.jsx';
import { useQuakeFeed } from '../lib/useQuakeFeed.js';
import { useEqdbSearch } from '../lib/useEqdbSearch.js';
import { useVolcanoFeed } from '../lib/useVolcanoFeed.js';

// Slot 0 is the earthquake browser, slot 1 the eqdb search feature, slot 2
// the map display settings moved down from the old standalone top-right
// panel, slot 3 the volcano alert browser.
const ITEMS = [
  { id: 0, label: '地震' },
  { id: 1, label: '地震検索' },
  { id: 2, label: '震源表示' },
  { id: 3, label: '火山情報' },
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

// Settings icon: four dots at the corners of a square.
function GridDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <circle cx="7" cy="7" r="2.3" />
      <circle cx="17" cy="7" r="2.3" />
      <circle cx="7" cy="17" r="2.3" />
      <circle cx="17" cy="17" r="2.3" />
    </svg>
  );
}

// Volcano icon — provided by the user directly (viewBox/paths kept as-is;
// only the color is switched from a hardcoded gray to currentColor so it
// follows the same idle/active tint the other icons use).
function VolcanoIcon() {
  return (
    <svg viewBox="0 0 64 63" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
      <g transform="translate(3.000000, 1.000000)">
        <path d="M52,0 C49.2,0 46.7,1.9 45.6,4.5 L45,4.5 C42.4,4.5 40.3,6.5 40,9.1 C38.1,9.6 36.6,11.5 36.6,13.7 C36.6,14.2 36.7,14.6 36.8,15 L36.6,15 C35.3,15 34.2,16.1 34.2,17.5 C34.2,18.9 35.3,20 36.6,20 C37.8,20 38.8,19 39,17.8 C39.6,18.2 40.4,18.4 41.2,18.4 C43,18.4 44.5,17.3 45.3,15.8 C46,16.3 46.9,16.6 47.9,16.6 C49.7,16.6 51.2,15.5 51.9,14 C56,13.8 59.1,11.3 59.1,7.5 C59,3.4 55.8,0 52,0 L52,0 Z" />
        <path d="M58.6,61 L37.4,24 L31,24 L19.5,44.1 L14.4,37.2 L-0.5,61 L58.6,61 Z" />
        <path d="M43.1,35.5 L39.1,40.2 L34.2,37.2 L30.2,40.2 L25.3,35.2" />
      </g>
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

// Earthquake slot: wider (room for the detail card's M/深さ columns) and
// taller in list mode (scrollable) than in detail mode (one card's worth).
const QUAKE_OPEN_WIDTH = 300;
const QUAKE_LIST_HEIGHT = TOPBAR_HEIGHT + 300;
const QUAKE_DETAIL_HEIGHT = TOPBAR_HEIGHT + 210;

// Search slot: same width as the browser (same detail card), but taller
// while showing the form + scrollable results.
const SEARCH_FORM_HEIGHT = TOPBAR_HEIGHT + 420; // 380 + room for 開始日/終了日 now stacking into two rows instead of one

// Settings slot: same width again for visual consistency across the three
// real slots; tall enough for every control row (period toggle + either the
// day-count row or the two date inputs, minMag slider, exaggeration slider,
// stems toggle, refresh button) without its own inner scroll kicking in.
const SETTINGS_HEIGHT = TOPBAR_HEIGHT + 360;

// Volcano slot: same width again; list mode shows all 120 volcanoes
// (scrollable) so it gets the tallest list footprint, detail mode is a
// single card like the other two browsers.
const VOLCANO_LIST_HEIGHT = TOPBAR_HEIGHT + 380;
const VOLCANO_DETAIL_HEIGHT = TOPBAR_HEIGHT + 200;

function openSizeFor(index, quakeFeed, eqdbSearch, volcanoFeed) {
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
  if (index === 2) {
    return { width: QUAKE_OPEN_WIDTH, height: SETTINGS_HEIGHT };
  }
  return {
    width: QUAKE_OPEN_WIDTH,
    height: volcanoFeed.selected ? VOLCANO_DETAIL_HEIGHT : VOLCANO_LIST_HEIGHT,
  };
}

export default function IconDock({ engineRef, mapSettings }) {
  const [active, setActive] = useState(null);
  const open = active != null;
  const toggle = (i) => setActive((cur) => (cur === i ? null : i));

  // Kept mounted (and the WebSocket / map-sync effects live) for the dock's
  // whole lifetime, not just while a slot is open, so both are already
  // current the moment the person opens them. volcanoFeed polls continuously
  // regardless of open state, but only draws map markers while its own tab
  // (index 3) is open — see its `visible` argument below.
  const quakeFeed = useQuakeFeed(engineRef);
  const eqdbSearch = useEqdbSearch(engineRef, quakeFeed.colorScheme);
  const volcanoFeed = useVolcanoFeed(engineRef, open && active === 3);

  const { width: openWidth, height: openHeight } = openSizeFor(active ?? 0, quakeFeed, eqdbSearch, volcanoFeed);

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
              aria-label={item.label}
            >
              {item.id === 0 ? <QuakeIcon /> : item.id === 1 ? <SearchGlassIcon /> : item.id === 2 ? <GridDotsIcon /> : <VolcanoIcon />}
            </PressableButton>
          </div>
        );
      })}

      <div className="icon-dock-content" style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}>
        {open && active === 0 && <QuakePanel feed={quakeFeed} />}
        {open && active === 1 && <QuakeSearchPanel feed={eqdbSearch} colorScheme={quakeFeed.colorScheme} />}
        {open && active === 2 && <MapSettingsPanel {...mapSettings} />}
        {open && active === 3 && <VolcanoPanel feed={volcanoFeed} />}
      </div>
    </div>
  );
}
