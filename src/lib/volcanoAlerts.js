// 火山の噴火警報・予報コード表と配色。
//
// 出典:
//  - 気象庁「地震火山関連XML電文解説資料」内のサンプルXML（<Name>/<Code>対応）
//    で確認できたコード: 11, 12, 13, 15, 23, 25, 35, 36
//  - warning.json の実データで確認できたコード: 22, 36
//  - 14, 21, 24 はコード体系の並び（1X=レベル運用, 2X=レベル未導入・陸上,
//    3X=海底火山）からの推定。実データ未確認のため、実運用で違うコードが
//    来た場合は「不明」としてグレー表示にフォールバックする。
//
// 配色は気象庁「気象庁ホームページにおける気象情報の色の基準について」の
// 基本配色（黒/紫/赤/橙/黄/灰1/灰2）に準拠。レベル1(平常)を灰色2とすること
// は同資料に明記されている。レベル2〜5の割り当ては警戒度順（紫>赤>橙>黄）
// の一般的な対応に基づく。

export const VOLCANO_ALERT_CODES = {
  '11': { label: 'レベル1（活火山であることに留意）', short: '1', kind: 'numbered', confirmed: true },
  '12': { label: 'レベル2（火口周辺規制）', short: '2', kind: 'numbered', confirmed: true },
  '13': { label: 'レベル3（入山規制）', short: '3', kind: 'numbered', confirmed: true },
  '14': { label: 'レベル4（避難準備）', short: '4', kind: 'numbered', confirmed: false },
  '15': { label: 'レベル5（避難）', short: '5', kind: 'numbered', confirmed: true },
  '21': { label: '平常', short: '平常', kind: 'text', confirmed: false },
  '22': { label: '火口周辺危険', short: '危険', kind: 'text', confirmed: true },
  '23': { label: '入山危険', short: '危険', kind: 'text', confirmed: true },
  '24': { label: '山麓厳重警戒', short: '厳重', kind: 'text', confirmed: false },
  '25': { label: '居住地域厳重警戒', short: '厳重', kind: 'text', confirmed: true },
  '35': { label: '平常（海底火山）', short: '平常', kind: 'text', confirmed: true },
  '36': { label: '周辺海域警戒', short: '警戒', kind: 'text', confirmed: true },
};

// 気象庁配色ガイドの基本配色（RGB）
const COLOR_PURPLE = '#c800ff'; // 200,0,255
const COLOR_RED = '#ff2800'; // 255,40,0
const COLOR_ORANGE = '#ffaa00'; // 255,170,0
const COLOR_YELLOW = '#faf500'; // 250,245,0
const COLOR_GRAY2 = '#f2f2ff'; // 242,242,255 (灰色2/平常)

export const VOLCANO_ALERT_COLOR = {
  '11': COLOR_GRAY2,
  '12': COLOR_YELLOW,
  '13': COLOR_ORANGE,
  '14': COLOR_RED,
  '15': COLOR_PURPLE,
  '21': COLOR_GRAY2,
  '22': COLOR_ORANGE,
  '23': COLOR_RED,
  '24': COLOR_PURPLE,
  '25': COLOR_PURPLE,
  '35': COLOR_GRAY2,
  '36': COLOR_RED,
};

// 一覧の並び替え用ランク（大きいほど警戒度が高い）
export const VOLCANO_ALERT_RANK = {
  '15': 100,
  '25': 90,
  '24': 90,
  '14': 80,
  '23': 70,
  '36': 65,
  '13': 60,
  '22': 50,
  '12': 40,
  '11': 10,
  '21': 10,
  '35': 10,
};

export const VOLCANO_UNKNOWN_COLOR = '#8e8e93'; // 未知コード
export const VOLCANO_NO_DATA_COLOR = '#5a5a5e'; // 履歴なし（監視情報なし）

export function getVolcanoAlertMeta(code) {
  if (code == null) return null;
  return VOLCANO_ALERT_CODES[code] || null;
}

export function getVolcanoAlertColor(code) {
  if (code == null) return VOLCANO_NO_DATA_COLOR;
  return VOLCANO_ALERT_COLOR[code] || VOLCANO_UNKNOWN_COLOR;
}

export function getVolcanoAlertRank(code) {
  if (code == null) return -1; // 履歴なしは最下位
  if (Object.prototype.hasOwnProperty.call(VOLCANO_ALERT_RANK, code)) {
    return VOLCANO_ALERT_RANK[code];
  }
  return 1; // 未知コードは「履歴なし」より上・既知の平常より下
}

const WARNING_URL = 'https://www.jma.go.jp/bosai/volcano/data/warning.json';

/**
 * warning.json（噴火警報・予報の発表履歴）を取得し、火山コードごとに
 * 最新（reportDatetimeが最も新しい）の「対象火山」状態だけを残した
 * Map<volcanoCode, { code, name, condition, reportDatetime }> を返す。
 */
export async function fetchVolcanoAlerts() {
  const res = await fetch(WARNING_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const events = await res.json();
  return latestAlertsByVolcano(events);
}

export function latestAlertsByVolcano(events) {
  const latest = new Map();
  for (const ev of events || []) {
    const infos = ev.volcanoInfos || [];
    const target = infos.find((vi) => vi.type === '噴火警報・予報（対象火山）');
    if (!target) continue;
    for (const item of target.items || []) {
      for (const area of item.areas || []) {
        const vcode = area?.code;
        if (!vcode) continue;
        const cur = latest.get(vcode);
        if (!cur || ev.reportDatetime > cur.reportDatetime) {
          latest.set(vcode, {
            code: item.code,
            name: item.name,
            condition: item.condition,
            reportDatetime: ev.reportDatetime,
          });
        }
      }
    }
  }
  return latest;
}

// "2026-09-12T09:30:00+09:00" -> "2026/09/12 09:30"
export function formatVolcanoDateTime(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
}

// "2026-09-12T09:30:00+09:00" -> "09/12 09:30"
export function formatVolcanoTimeShort(iso) {
  if (!iso) return '';
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[1]}/${m[2]} ${m[3]}:${m[4]}`;
}
