// Depth (km) -> color, following the common seismology convention of
// warm/shallow -> cool/deep. Returns a hex number (for CSS/legend use).
const SHALLOW = [0xff, 0x6b, 0x4a]; // #ff6b4a
const MID = [0xff, 0xb8, 0x4d]; // #ffb84d
const DEEP = [0x4c, 0x8d, 0xff]; // #4c8dff

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Returns [r,g,b] as 0-255 floats (not rounded — callers decide). */
export function depthToRgb255(depthKm) {
  const d = Math.max(0, depthKm || 0);
  if (d <= 150) return mixRgb(SHALLOW, MID, Math.min(1, d / 150));
  return mixRgb(MID, DEEP, Math.min(1, (d - 150) / 400));
}

/** Returns [r,g,b] as 0-1 floats, for use as a THREE.BufferAttribute color. */
export function depthToRgb01(depthKm) {
  const [r, g, b] = depthToRgb255(depthKm);
  return [r / 255, g / 255, b / 255];
}

export function colorForDepthKm(depthKm) {
  const [r, g, b] = depthToRgb255(depthKm).map(Math.round);
  return (r << 16) | (g << 8) | b;
}

// Point sprite diameter in *screen pixels*, independent of zoom/distance —
// matches the "flat point cloud" look of density-map style earthquake
// visualizations, where dot size communicates magnitude directly rather
// than shrinking with camera distance the way a real-world-scaled 3D object
// would.
export function pixelSizeForMag(mag) {
  const m = Math.max(0, mag || 0);
  return 2.5 + Math.pow(m, 1.8) * 1.3;
}
