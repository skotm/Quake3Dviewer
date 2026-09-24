/* ─────────────────────────────────────────────────────
   火山マーカーのアイコン生成。quakeStationIcons.jsと同じ方式で、
   「三角形(△)+フチ+(レベル運用火山のみ)警戒レベル数字」を
   canvasへ焼いてMapLibreのsymbolレイヤーへaddImage/updateImageする。

   フチは警戒状態コードではなく、各火山のvolcano_list.json上の
   levelOperationフラグで決める: true(噴火警戒レベル運用火山)は実線、
   false/未設定(レベル未運用)は点線。同じ警戒状態コードでも
   levelOperationがtrue/false両方あり得るため、コードごとに
   実線・点線の2種類のアイコンを用意する。
   ───────────────────────────────────────────────────── */

import {
  VOLCANO_ALERT_CODES,
  VOLCANO_ALERT_COLOR,
  VOLCANO_UNKNOWN_COLOR,
  VOLCANO_NO_DATA_COLOR,
} from './volcanoAlerts.js';

export const VOLCANO_ICON_BASE_RADIUS = 32; // bitmap側の半径(px)。icon-sizeで実際の大きさへスケールする。

const UNKNOWN_BASE_ID = 'volcano-icon-unknown';
const NO_DATA_BASE_ID = 'volcano-icon-nodata';

// 背景色の明るさから読みやすい文字色(黒/白)を選ぶ。
export function contrastTextColor(hex) {
  if (!hex) return '#ffffff';
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0b0b0c' : '#ffffff';
}

function buildVolcanoIconCanvas(fillColor, label, { filled = true, strokeColor, dashed = false } = {}) {
  const size = VOLCANO_ICON_BASE_RADIUS * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2 + 3; // 三角形は重心が下寄りに見えるので、少し下へシフトして視覚中心を合わせる
  const r = VOLCANO_ICON_BASE_RADIUS - 4;

  const top = { x: cx, y: cy - r };
  const right = { x: cx + r * 0.95, y: cy + r * 0.78 };
  const left = { x: cx - r * 0.95, y: cy + r * 0.78 };

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.lineWidth = 3;
  if (dashed) ctx.setLineDash([5, 4]);
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
  } else if (filled) {
    // 明るい塗り(平常=灰色2など)は白フチだと同化するので、フチは文字色と逆にする。
    ctx.strokeStyle = contrastTextColor(fillColor) === '#ffffff' ? '#ffffff' : '#000000';
  } else {
    ctx.strokeStyle = '#8e8e93';
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (label) {
    const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Noto Sans JP", sans-serif';
    const fontSize = r * 0.85;
    ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = contrastTextColor(fillColor);
    ctx.fillText(label, cx, cy + r * 0.16);
  }
  return ctx.getImageData(0, 0, size, size);
}

function registerVariant(map, baseId, fillColor, label, filled) {
  [true, false].forEach((levelOperation) => {
    const id = iconIdFromBase(baseId, levelOperation);
    const img = buildVolcanoIconCanvas(fillColor, label, {
      filled,
      dashed: !levelOperation,
      strokeColor: !filled ? '#8e8e93' : undefined,
    });
    if (map.hasImage(id)) map.updateImage(id, img); else map.addImage(id, img);
  });
}

/**
 * 火山警戒状態コードごと(既知コード全種 + 未知コード用 + 履歴なし用)に、
 * レベル運用(実線)/未運用(点線)の2バリアントずつ三角形アイコンを生成し、
 * MapLibreへaddImage/updateImageする。
 */
export function registerVolcanoIcons(map) {
  Object.entries(VOLCANO_ALERT_CODES).forEach(([code, meta]) => {
    const color = VOLCANO_ALERT_COLOR[code] || VOLCANO_UNKNOWN_COLOR;
    // 数字を表示するのは警戒レベルが運用されている火山(コード11〜15)のみ。
    const label = meta.kind === 'numbered' ? meta.short : null;
    registerVariant(map, `volcano-icon-${code}`, color, label, true);
  });

  // 未知コード・履歴なし(=警戒レベル情報がない)火山は、塗りをグレーで統一する。
  registerVariant(map, UNKNOWN_BASE_ID, VOLCANO_UNKNOWN_COLOR, null, true);
  registerVariant(map, NO_DATA_BASE_ID, VOLCANO_NO_DATA_COLOR, null, true);
}

function iconIdFromBase(baseId, levelOperation) {
  return `${baseId}-${levelOperation ? 'solid' : 'dashed'}`;
}

// code: 警戒状態コード('11'など、履歴なしはnull/undefined)
// levelOperation: volcano_list.json の levelOperation (true/false)
export function volcanoIconIdForCode(code, levelOperation) {
  if (code == null) return iconIdFromBase(NO_DATA_BASE_ID, levelOperation);
  const baseId = VOLCANO_ALERT_CODES[code] ? `volcano-icon-${code}` : UNKNOWN_BASE_ID;
  return iconIdFromBase(baseId, levelOperation);
}
