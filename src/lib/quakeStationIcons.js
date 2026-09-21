/* ─────────────────────────────────────────────────────
   観測点マーカーのアイコン生成。MeteoQuake(App.tsx)の
   buildStationIconCanvas/registerStationIconsを移植したもの。
   震度キーごとに「丸+白フチ+震度番号」をcanvasへ焼いてMapLibreの
   symbolレイヤーへaddImage/updateImageする(text-fieldを使わないため、
   スタイルにglyphs(フォント配信)を用意しなくても数字を表示できる)。
   ───────────────────────────────────────────────────── */

export const STATION_ICON_KEYS = ['0', '1', '2', '3', '4', '5', '5-', '5u', '5+', '6', '6-', '6+', '7', '?'];
export const STATION_ICON_BASE_RADIUS = 32; // bitmap側の半径(px)。icon-sizeで実際の大きさへスケールする。

function buildStationIconCanvas(bg, fg, label, withText, strokeColor = '#ffffff') {
  const size = STATION_ICON_BASE_RADIUS * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = STATION_ICON_BASE_RADIUS - 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();

  if (withText) {
    const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", "Noto Sans JP", sans-serif';
    // 「5-」「6+」のような2文字が「1」等の1文字より小さく見えないよう、
    // 実際の文字幅を測って丸からはみ出さない範囲でできるだけ大きく表示する。
    const maxTextWidth = r * 1.7;
    let fontSize = r * 1.3;
    ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
    const width = ctx.measureText(label).width;
    if (width > maxTextWidth) {
      fontSize *= maxTextWidth / width;
      ctx.font = `800 ${fontSize.toFixed(1)}px ${FONT_STACK}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(label, cx, cy + 1);
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * 現在の震度配色スキームに合わせて、観測点アイコン(数字あり/なしの2種類 x
 * 震度キー分)をまとめて生成し、MapLibreへaddImage/updateImageする。
 * 配色スキームが切り替わるたびに呼ぶ。
 */
export function registerStationIcons(map, scheme) {
  STATION_ICON_KEYS.forEach((key) => {
    const style = scheme.colors[key === '5u' ? '5-' : key] || scheme.colors['0'];
    // 地図上の丸には"5弱"ではなくキー表記(5-,6+等)をそのまま出す。"5u"だけは「未」にする。
    const label = key === '5u' ? '未' : key;
    // 気象庁配色の震度1は塗りがほぼ白なので、既定の白い縁のままだと塗りと縁が同化する。
    const strokeColor = scheme.id === 'jma' && key === '1' ? '#000000' : '#ffffff';
    const dotImg = buildStationIconCanvas(style.bg, style.fg, label, false, strokeColor);
    const numImg = buildStationIconCanvas(style.bg, style.fg, label, true, strokeColor);
    const dotId = `station-icon-${key}-dot`;
    const numId = `station-icon-${key}-num`;
    if (map.hasImage(dotId)) map.updateImage(dotId, dotImg); else map.addImage(dotId, dotImg);
    if (map.hasImage(numId)) map.updateImage(numId, numImg); else map.addImage(numId, numImg);
  });
}
