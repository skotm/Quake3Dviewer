const CLUSTERS = [
  { lat: 38.3, lon: 142.4, spread: 1.4, n: 40, magBase: 2.8, depthRange: [10, 60], place: '(sample) E OFF TOHOKU' },
  { lat: 33.0, lon: 136.5, spread: 1.0, n: 18, magBase: 2.6, depthRange: [15, 45], place: '(sample) NANKAI TROUGH' },
  { lat: 26.5, lon: 141.0, spread: 1.2, n: 16, magBase: 3.5, depthRange: [80, 450], place: '(sample) IZU-BONIN ISLANDS' },
  { lat: 32.8, lon: 130.7, spread: 0.6, n: 12, magBase: 2.4, depthRange: [5, 25], place: '(sample) KUMAMOTO REGION' },
  { lat: 43.0, lon: 145.5, spread: 0.9, n: 14, magBase: 3.0, depthRange: [30, 150], place: '(sample) OFF HOKKAIDO' },
];

export function buildSampleQuakes() {
  const now = Date.now();
  const features = [];
  CLUSTERS.forEach((c) => {
    for (let i = 0; i < c.n; i++) {
      features.push({
        lon: c.lon + (Math.random() - 0.5) * c.spread,
        lat: c.lat + (Math.random() - 0.5) * c.spread,
        depth: c.depthRange[0] + Math.random() * (c.depthRange[1] - c.depthRange[0]),
        mag: Math.round((c.magBase + Math.random() * 2.5) * 10) / 10,
        place: c.place,
        time: now - Math.random() * 7 * 86400000,
        intensity: '',
        dayKey: 'sample',
      });
    }
  });
  return features;
}
