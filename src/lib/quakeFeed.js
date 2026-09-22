/* ─────────────────────────────────────────────────────
   P2P地震情報 JSON API (v2) + WebSocket
   MeteoQuake(App.tsx)の地震タブから、地震情報(code:551)の取得・正規化・
   マージ・リアルタイム購読ロジックを移植したもの。津波(552)・EEW(556)・
   訓練配信・近隣/地震名検索は対象外(このアプリでは地震の一覧・詳細のみ扱う)。
   ───────────────────────────────────────────────────── */

const P2PQUAKE_HISTORY_URL_BASE = 'https://api.p2pquake.net/v2/history?codes=551';
const P2PQUAKE_WS_URL = 'wss://api.p2pquake.net/v2/ws';
const P2PQUAKE_API_PAGE_SIZE = 100; // /history は1リクエストにつき最大100件までしか指定できない

/* ---------- 震度スケール ---------- */

export const INTENSITY_LABEL = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '5-': '5弱', '5+': '5強', '6': '6', '6-': '6弱', '6+': '6強', '7': '7',
  '5u': '5弱以上未入電', // 観測点の震度計は検知したが、確定した震度をまだ入電できていない状態(scale=46)
  '?': '?',
};

// 震度の弱い順。観測点の集計(区域内の最大震度を選ぶ)などに使う。
export const INTENSITY_ORDER = ['0', '1', '2', '3', '4', '5', '5-', '5u', '5+', '6', '6-', '6+', '7'];

export const QUAKE_COLOR_SCHEMES = {
  legacy: {
    id: 'legacy',
    label: 'eqs viewer配色',
    colors: {
      '0': { bg: '#8E8E93', fg: '#fff' },
      '1': { bg: '#64D2FF', fg: '#0B0B0C' },
      '2': { bg: '#0A84FF', fg: '#fff' },
      '3': { bg: '#30D158', fg: '#0B0B0C' },
      '4': { bg: '#FFD60A', fg: '#0B0B0C' },
      '5': { bg: '#FF9F0A', fg: '#0B0B0C' },
      '5-': { bg: '#FF9F0A', fg: '#0B0B0C' },
      '5+': { bg: '#FF453A', fg: '#fff' },
      '6': { bg: '#FF2D55', fg: '#fff' },
      '6-': { bg: '#FF2D55', fg: '#fff' },
      '6+': { bg: '#BF5AF2', fg: '#fff' },
      '7': { bg: '#5E5CE6', fg: '#fff' },
      '?': { bg: '#8E8E93', fg: 'rgba(255,255,255,0.5)' },
    },
  },
  // 気象庁「ホームページにおける気象情報の配色に関する設定指針」の公式RGB値
  jma: {
    id: 'jma',
    label: '気象庁配色',
    colors: {
      '0': { bg: '#E5E5EA', fg: '#0B0B0C' },
      '1': { bg: '#F2F2FF', fg: '#0B0B0C' },
      '2': { bg: '#00AAFF', fg: '#0B0B0C' },
      '3': { bg: '#0041FF', fg: '#fff' },
      '4': { bg: '#FAE696', fg: '#0B0B0C' },
      '5': { bg: '#FFE600', fg: '#0B0B0C' },
      '5-': { bg: '#FFE600', fg: '#0B0B0C' },
      '5+': { bg: '#FF9900', fg: '#0B0B0C' },
      '6': { bg: '#FF2800', fg: '#fff' },
      '6-': { bg: '#FF2800', fg: '#fff' },
      '6+': { bg: '#A50021', fg: '#fff' },
      '7': { bg: '#B40068', fg: '#fff' },
      '?': { bg: '#C7C7CC', fg: 'rgba(11,11,12,0.5)' },
    },
  },
  fill: {
    id: 'fill',
    label: 'コントラスト配色',
    colors: {
      '0': { bg: '#3A3A3C', fg: '#fff' },
      '1': { bg: '#2F6690', fg: '#fff' },
      '2': { bg: '#3FA9E0', fg: '#0B0B0C' },
      '3': { bg: '#4FBF67', fg: '#0B0B0C' },
      '4': { bg: '#FFD60A', fg: '#0B0B0C' },
      '5': { bg: '#FF9F0A', fg: '#0B0B0C' },
      '5-': { bg: '#FF9F0A', fg: '#0B0B0C' },
      '5+': { bg: '#FF7A1A', fg: '#0B0B0C' },
      '6': { bg: '#E0342C', fg: '#fff' },
      '6-': { bg: '#E0342C', fg: '#fff' },
      '6+': { bg: '#8A1518', fg: '#fff' },
      '7': { bg: '#AF52DE', fg: '#fff' },
      '?': { bg: '#3A3A3C', fg: 'rgba(255,255,255,0.5)' },
    },
  },
};

export function getIntensityStyle(schemeId, intensityKey) {
  const scheme = QUAKE_COLOR_SCHEMES[schemeId] || QUAKE_COLOR_SCHEMES.legacy;
  // '5u'(震度5弱以上未入電)は専用の色を持たず、5弱(5-)の配色を流用する。
  const colorKey = intensityKey === '5u' ? '5-' : intensityKey;
  const c = scheme.colors[colorKey] || scheme.colors['0'];
  const label = INTENSITY_LABEL[intensityKey] || INTENSITY_LABEL['0'];
  return { bg: c.bg, fg: c.fg, label };
}

export function splitIntensityLabel(label) {
  const m = /^([0-7])(弱|強)?$/.exec(label);
  if (!m) return { num: label, suffix: null };
  return { num: m[1], suffix: m[2] || null };
}

export function maxScaleToIntensityKey(maxScale) {
  const map = {
    '-1': '0', '0': '0',
    '10': '1', '20': '2', '30': '3', '40': '4',
    '44': '5', '45': '5-', '50': '5+',
    '46': '5u',
    '54': '6', '55': '6-', '60': '6+',
    '70': '7',
  };
  return map[String(maxScale)] ?? '?';
}

/* ---------- localStorage設定: 配色スキーム・取得件数 ---------- */

const QUAKE_COLOR_SCHEME_STORAGE_KEY = 'quakeColorScheme';
const QUAKE_FETCH_LIMIT_STORAGE_KEY = 'quakeFetchLimit';
export const QUAKE_FETCH_LIMIT_MIN = 1;
export const QUAKE_FETCH_LIMIT_MAX = 1000;
export const QUAKE_FETCH_LIMIT_DEFAULT = 100;

export function loadStoredQuakeColorScheme() {
  try {
    const saved = localStorage.getItem(QUAKE_COLOR_SCHEME_STORAGE_KEY);
    if (saved && QUAKE_COLOR_SCHEMES[saved]) return saved;
  } catch (err) {
    console.warn('震度配色の設定を読み込めませんでした:', err);
  }
  return 'legacy';
}

export function saveQuakeColorScheme(schemeId) {
  try {
    localStorage.setItem(QUAKE_COLOR_SCHEME_STORAGE_KEY, schemeId);
  } catch (err) {
    console.warn('震度配色の設定を保存できませんでした:', err);
  }
}

export function clampQuakeFetchLimit(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return QUAKE_FETCH_LIMIT_DEFAULT;
  return Math.min(QUAKE_FETCH_LIMIT_MAX, Math.max(QUAKE_FETCH_LIMIT_MIN, n));
}

export function loadStoredQuakeFetchLimit() {
  try {
    const saved = localStorage.getItem(QUAKE_FETCH_LIMIT_STORAGE_KEY);
    if (saved != null) return clampQuakeFetchLimit(saved);
  } catch (err) {
    console.warn('地震の取得件数の設定を読み込めませんでした:', err);
  }
  return QUAKE_FETCH_LIMIT_DEFAULT;
}

export function saveQuakeFetchLimit(limit) {
  try {
    localStorage.setItem(QUAKE_FETCH_LIMIT_STORAGE_KEY, String(clampQuakeFetchLimit(limit)));
  } catch (err) {
    console.warn('地震の取得件数の設定を保存できませんでした:', err);
  }
}

/* ---------- 発表段階(震度速報→震源に関する情報→震度に関する情報) ---------- */

const QUAKE_STAGE_RANK = { prompt: 1, destination: 2, detail: 3 };
export const QUAKE_STAGE_LABEL = {
  prompt: '震度速報',
  destination: '震源情報',
  // detail(確定)はバッジ無し
};
function quakeStageFromIssueType(issueType) {
  if (issueType === 'ScalePrompt') return 'prompt';
  if (issueType === 'Destination') return 'destination';
  return 'detail';
}

/* ---------- 時刻表示 ---------- */

export function formatQuakeTime(raw) {
  if (!raw) return '';
  return raw.split('.')[0];
}

export function formatQuakeTimeShort(raw) {
  if (!raw) return '';
  const [datePart, timePart] = raw.split(' ');
  if (!timePart) return raw;
  const [hh, mm] = timePart.split(':');
  if (hh == null || mm == null) return raw;
  return `${datePart} ${hh}:${mm}頃`;
}

/* ---------- API 1レコード -> アプリ内カード形式 ---------- */

export function toQuakeCard(item) {
  const eq = item.earthquake;
  const hypo = eq?.hypocenter;
  const points = Array.isArray(item?.points) ? item.points : [];

  const isForeign = item?.issue?.type === 'Foreign';

  let maxScale = eq?.maxScale;
  if (!isForeign && (maxScale == null || maxScale === -1) && points.length > 0) {
    maxScale = points.reduce((max, p) => (typeof p.scale === 'number' && p.scale > max ? p.scale : max), -1);
  }
  const maxScaleUnknown = !isForeign && maxScale === -1 && points.length === 0;

  const id = item.id || `noid_${eq?.time || '?'}_${hypo?.name || '?'}`;
  const stage = quakeStageFromIssueType(item?.issue?.type);

  return {
    id,
    time: formatQuakeTime(eq?.time),
    issueTime: item?.issue?.time || null,
    stage,
    place: hypo?.name || (stage === 'prompt' ? '震源調査中' : '震源地不明'),
    maxIntensity: isForeign ? '?' : (maxScaleUnknown ? '?' : maxScaleToIntensityKey(maxScale)),
    isForeign,
    magnitude: typeof hypo?.magnitude === 'number' && hypo.magnitude > 0 ? hypo.magnitude : null,
    depth: typeof hypo?.depth === 'number' && hypo.depth >= 0 ? hypo.depth : null,
    latitude: typeof hypo?.latitude === 'number' && hypo.latitude !== -200 ? hypo.latitude : null,
    longitude: typeof hypo?.longitude === 'number' && hypo.longitude !== -200 ? hypo.longitude : null,
    // { pref, addr, scale, isArea } の配列。scaleは10刻みのJMAコードのまま保持する。
    points,
    domesticTsunami: eq?.domesticTsunami || 'Unknown',
    freeFormComment: item?.comments?.freeFormComment || null,
  };
}

/* ---------- 電文(津波の有無・付加文) ---------- */

const TSUNAMI_TEXT = {
  None: { text: 'この地震による津波の心配はありません。' },
  Unknown: { text: '津波の有無について、現在調査中です。', color: '#FFD60A' },
  Checking: { text: '津波の有無について、現在調査中です。', color: '#FFD60A' },
  NonEffective: { text: '若干の海面変動が予想されますが、被害の心配はありません。', color: '#FFD60A' },
  Watch: { text: 'この地震により、津波警報・注意報等が発表されています。', color: '#FF453A' },
  Warning: { text: 'この地震により、津波警報・注意報等が発表されています。', color: '#FF453A' },
  MajorWarning: { text: 'この地震により、津波警報・注意報等が発表されています。', color: '#FF453A' },
};

export function buildQuakeMessage(quake) {
  const tsunami = TSUNAMI_TEXT[quake.domesticTsunami] || TSUNAMI_TEXT.None;
  const lines = [{ label: '津波情報', text: tsunami.text, color: tsunami.color || null }];
  if (quake.freeFormComment) {
    lines.push({ label: '付加文', text: quake.freeFormComment, color: null });
  }
  return lines;
}

/* ---------- 重複除去・段階マージ ---------- */

function pointsRichness(card) {
  if (!Array.isArray(card.points) || card.points.length === 0) return 0;
  return card.points.some((p) => p.isArea === false) ? 2 : 1;
}

function hasKnownHypocenter(card) {
  return card.place !== '震源地不明' && card.place !== '震源調査中';
}

export function mergeQuakeCards(a, b) {
  if (!a) return b;
  if (!b) return a;

  const bIsNewer = (b.issueTime || '') >= (a.issueTime || '');
  const newer = bIsNewer ? b : a;
  const older = bIsNewer ? a : b;

  const hypoSrc = hasKnownHypocenter(newer) ? newer : (hasKnownHypocenter(older) ? older : newer);

  const newerRichness = pointsRichness(newer);
  const olderRichness = pointsRichness(older);
  const pointsSrc = newerRichness >= olderRichness ? newer : older;

  const stageRank = (s) => QUAKE_STAGE_RANK[s] || 0;
  const finalStage = stageRank(a.stage) >= stageRank(b.stage) ? a.stage : b.stage;

  const isRealId = (id) => typeof id === 'string' && !id.startsWith('noid_');
  const id = isRealId(newer.id) ? newer.id : (isRealId(older.id) ? older.id : newer.id);

  return {
    id,
    time: a.time,
    issueTime: newer.issueTime,
    stage: finalStage,
    place: hypoSrc.place,
    magnitude: hypoSrc.magnitude,
    depth: hypoSrc.depth,
    latitude: hypoSrc.latitude,
    longitude: hypoSrc.longitude,
    maxIntensity: pointsSrc.maxIntensity,
    points: pointsSrc.points,
    isForeign: newer.isForeign,
    domesticTsunami: newer.domesticTsunami,
    freeFormComment: newer.freeFormComment ?? older.freeFormComment ?? null,
  };
}

export function dedupeQuakeList(list) {
  const order = [];
  const merged = new Map();
  for (const q of list) {
    const key = q.time;
    if (!merged.has(key)) {
      order.push(key);
      merged.set(key, q);
    } else {
      merged.set(key, mergeQuakeCards(merged.get(key), q));
    }
  }
  return order.map((key) => merged.get(key));
}

/* ---------- 一覧取得 ---------- */

export async function fetchRecentQuakes(limit = QUAKE_FETCH_LIMIT_DEFAULT) {
  const target = clampQuakeFetchLimit(limit);
  const results = [];
  const seenIds = new Set();
  let offset = 0;

  while (results.length < target) {
    const pageSize = Math.min(P2PQUAKE_API_PAGE_SIZE, target - results.length);
    const res = await fetch(`${P2PQUAKE_HISTORY_URL_BASE}&limit=${pageSize}&offset=${offset}`);
    if (!res.ok) throw new Error(`地震情報の取得に失敗しました (${res.status})`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;

    const newItems = page.filter((item) => item?.id != null && !seenIds.has(item.id));
    if (newItems.length === 0) break;
    for (const item of newItems) seenIds.add(item.id);
    results.push(...newItems);

    offset += page.length;
    if (page.length < pageSize) break;
  }

  const list = results.filter((item) => item.earthquake).map(toQuakeCard);
  return dedupeQuakeList(list);
}

/* ---------- リアルタイム更新(WebSocket) ---------- */

function wsMessageToQuakeCard(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data.code !== 551) return null;
  if (!data.earthquake) return null;
  return toQuakeCard(data);
}

/**
 * P2P地震情報のWebSocketに接続し、地震情報(code:551)を受信するたびにonQuakeを呼ぶ。
 * 接続が切れた場合は5秒後に自動再接続する。戻り値のclose()で確実に切断する。
 */
export function connectQuakeWebSocket(onQuake, onStatusChange) {
  let ws = null;
  let closedByCaller = false;
  let reconnectTimer = null;

  function connect() {
    if (closedByCaller) return;
    ws = new WebSocket(P2PQUAKE_WS_URL);

    ws.onopen = () => onStatusChange?.('open');
    ws.onmessage = (event) => {
      const quake = wsMessageToQuakeCard(event.data);
      if (quake) onQuake(quake);
    };
    ws.onerror = (e) => console.error('P2P地震情報WebSocketエラー:', e);
    ws.onclose = () => {
      onStatusChange?.('closed');
      if (closedByCaller) return;
      reconnectTimer = setTimeout(connect, 5000);
    };
  }

  connect();

  return {
    close() {
      closedByCaller = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    },
  };
}
