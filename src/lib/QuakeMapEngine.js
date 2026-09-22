import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { idbGet, idbSet, STORE_MAP_DATA } from './idb.js';
import { depthToRgb01, pixelSizeForMag } from './color.js';
import { loadQuakeRegions } from './quakeAreas.js';
import { registerStationIcons, STATION_ICON_BASE_RADIUS } from './quakeStationIcons.js';
import { QUAKE_COLOR_SCHEMES, INTENSITY_ORDER } from './quakeFeed.js';

const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] };

// Parses the P2P地震情報API's "YYYY/MM/DD HH:MM:SS" occurrence time (JST) into
// a UTC epoch ms, the same representation jma.js's parseJmaTime() produces
// for rawFeatures — so the two can be compared directly when matching a
// browsed quake against the JMA hypocenter cloud (see _findJmaMatch below).
function parseP2pQuakeTime(raw) {
  if (!raw) return null;
  const [datePart, timePart] = raw.split(' ');
  if (!datePart || !timePart) return null;
  const [y, mo, d] = datePart.split('/').map(Number);
  const [h, mi, s] = timePart.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  return Date.UTC(y, mo - 1, d, h, mi, Number.isFinite(s) ? s : 0) - 9 * 3600 * 1000;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MAP_DATA_VERSION = 'v1'; // bump if public/data files change shape

// Meters of visual altitude per km of real depth, before the user's
// exaggeration slider is applied. Earthquake depth is real km, but rendering
// 1km = 1000m of altitude (i.e. to true scale) pushes points hundreds of km
// below ground once the exaggeration slider is used, which risks falling
// outside the depth range/precision MapLibre's shared projection matrix was
// designed for (it's tuned for near-ground content like building
// extrusions). Scaling it down keeps the exaggerated range comfortably
// within that budget while still reading as "clearly below ground".
const DEPTH_METERS_PER_KM = 125;

// Raycaster hit-test radius for point picking, in Mercator units. Calibrated
// for the default zoom (~4.3); because our points are fixed-pixel-size while
// this threshold is a fixed Mercator distance, hover precision drifts a bit
// at very different zoom levels (looser when zoomed out, tighter zoomed in).
const POINT_PICK_THRESHOLD = 0.002;

async function loadJsonWithCache(cacheKey, url) {
  const cached = await idbGet(STORE_MAP_DATA, cacheKey);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  const json = await res.json();
  await idbSet(STORE_MAP_DATA, cacheKey, json);
  return json;
}

function worldGeometryCollectionToFeatureCollection(world) {
  return {
    type: 'FeatureCollection',
    features: world.geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
  };
}

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#121214' } }],
};

// Custom point-sprite shader: draws each earthquake as a soft-edged circular
// dot at a fixed pixel size (via a per-vertex `size` attribute), colored by a
// per-vertex `color` attribute. A dense cluster of small, semi-transparent
// dots is the "point cloud" look we're going for, closer to how public
// seismicity density maps render, rather than lit 3D spheres.
const POINT_VERTEX_SHADER = `
  attribute vec3 color;
  attribute float size;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = size;
  }
`;
const POINT_FRAGMENT_SHADER = `
  precision mediump float;
  varying vec3 vColor;
  uniform float opacity;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, d) * opacity;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

export class QuakeMapEngine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks; // { onStats, onHover, onStatus }
    this.rawFeatures = [];
    this.state = { minMag: 2.0, exaggeration: 1.5, showStems: true };
    this.pointsMesh = null;
    this.stemsMesh = null;
    this._currentRecords = []; // parallel to pointsMesh vertices, for rayc[index] -> record
    this._selectedQuakeRecord = null; // { lat, lon, depth, mag } | null — the browsed quake's own hypocenter
    this.selectedHaloMesh = null;
    this.selectedCoreMesh = null;
    this.selectedStemMesh = null;
    this.selectedHaloMaterial = null;
    this.selectedCoreMaterial = null;
    this.selectedStemMaterial = null;
    this._selectedHaloBaseSize = 0; // for the pulse animation in render()
    this._destroyed = false;
    this.ready = false; // becomes true once the base map + three.js layer are set up
  }

  async init() {
    const map = new maplibregl.Map({
      container: this.container,
      style: EMPTY_STYLE,
      center: [138, 37],
      zoom: 4.3,
      pitch: 55,
      bearing: -10,
      // MapLibre computes its shared clip-plane range based on the camera's
      // current pitch/zoom, sized for near-ground content. At pitch 0 (looking
      // straight down) that range collapses to something too shallow for our
      // below-ground earthquake points, and deep ones get clipped out of
      // existence — see the notes in _rebuild(). Disallowing a true top-down
      // view keeps enough headroom that this doesn't happen; 12° is close
      // enough to straight-down to still read as a top-down map.
      minPitch: 12,
      maxPitch: 80,
      // Our basemap is just simplified polygons (no street-level detail), so
      // zooming in much further than this shows nothing new.
      maxZoom: 10,
      // Compact the built-in attribution control (the small "i" button) so
      // it takes up as little space as possible in the corner it shares
      // with our own legend panel.
      attributionControl: { compact: true },
      antialias: true,
      // Keep the WebGL drawing buffer around between frames. Without this,
      // browsers may discard it right after compositing, which breaks
      // backdrop-filter on the glass panels layered over the map.
      preserveDrawingBuffer: true,
    });
    this.map = map;

    await new Promise((resolve) => map.on('load', resolve));
    if (this._destroyed) return;

    this.callbacks.onStatus?.('loading', '地図データを読み込んでいます…');
    try {
      await this._loadBaseMap();
    } catch (err) {
      console.error(err);
      this.callbacks.onStatus?.(
        'error-map',
        '地図データの読み込みに失敗しました。public/data 以下のファイル配置を確認してください。'
      );
      return;
    }

    this._setupThreeLayer();
    this.ready = true;
    this.callbacks.onStatus?.('hidden');
  }

  async _loadBaseMap() {
    const base = import.meta.env.BASE_URL;
    const [world, prefectures] = await Promise.all([
      loadJsonWithCache(`world-${MAP_DATA_VERSION}`, `${base}data/world.json`),
      loadJsonWithCache(`prefectures-${MAP_DATA_VERSION}`, `${base}data/prefectures.json`),
    ]);

    const worldFC = worldGeometryCollectionToFeatureCollection(world);

    this.map.addSource('world', { type: 'geojson', data: worldFC });
    this.map.addLayer({
      id: 'world-fill',
      type: 'fill',
      source: 'world',
      paint: { 'fill-color': '#2a2a2d', 'fill-opacity': 0.93 },
    });
    this.map.addLayer({
      id: 'world-line',
      type: 'line',
      source: 'world',
      paint: { 'line-color': 'rgba(255,255,255,0.12)', 'line-width': 0.9, 'line-opacity': 0.8 },
    });

    this.map.addSource('prefectures', { type: 'geojson', data: prefectures });
    this.map.addLayer({
      id: 'pref-fill',
      type: 'fill',
      source: 'prefectures',
      paint: { 'fill-color': '#35363b', 'fill-opacity': 0.93 },
    });
    this.map.addLayer({
      id: 'pref-line',
      type: 'line',
      source: 'prefectures',
      paint: { 'line-color': 'rgba(255,255,255,0.26)', 'line-width': 1.1, 'line-opacity': 0.85 },
    });
  }

  _setupThreeLayer() {
    const engine = this;

    this.pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: POINT_VERTEX_SHADER,
      fragmentShader: POINT_FRAGMENT_SHADER,
      uniforms: { opacity: { value: 0.62 } },
      transparent: true,
      // See the render() comment below for why depth testing is off.
      depthTest: false,
      depthWrite: false,
    });

    const customLayer = {
      id: 'quake-3d',
      type: 'custom',
      renderingMode: '3d',

      onAdd(map, gl) {
        engine.scene = new THREE.Scene();
        // Use PerspectiveCamera (not the bare THREE.Camera base class) purely so
        // THREE.Raycaster recognizes it — we still overwrite projectionMatrix
        // manually every frame from MapLibre's matrix, so the constructor args
        // here are placeholders and never actually used for projection.
        engine.camera = new THREE.PerspectiveCamera();
        engine.quakeGroup = new THREE.Group();
        engine.scene.add(engine.quakeGroup);

        engine.renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
        });
        engine.renderer.autoClear = false;
      },

      render(gl, args) {
        // MapLibre changed this signature between major versions: v4 and older
        // pass the view-projection matrix directly as a 16-element array, while
        // v5 passes an options object carrying it at
        // defaultProjectionData.mainMatrix. Feeding the wrong shape into
        // Matrix4.fromArray() produces a garbage camera and nothing draws, so
        // accept either form.
        const matrix = Array.isArray(args) ? args : args?.defaultProjectionData?.mainMatrix;
        if (!matrix) {
          if (!engine._warnedNoMatrix) {
            console.error('Custom layer got no projection matrix from MapLibre', args);
            engine._warnedNoMatrix = true;
          }
          return;
        }

        engine.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        engine.camera.projectionMatrixInverse.copy(engine.camera.projectionMatrix).invert();
        engine.renderer.resetState();
        // MapLibre shares a single depth buffer across layers once any 3D
        // (renderingMode: '3d') layer is present in the style, and its own
        // fill/line layers write depth at ground level (altitude 0). Our
        // earthquake points sit *below* ground (negative altitude), so
        // without this clear they'd fail the depth test against the map's
        // own ground plane and never actually get drawn. Clearing depth
        // right before our draw sidesteps that (we also render with
        // depthTest disabled on our own material, belt-and-suspenders).
        engine.renderer.clearDepth();
        // Slow pulse on the selected-quake halo (opacity + size), so it
        // keeps drawing the eye even after the initial camera fit settles —
        // same trick as a "you are here" map pin.
        if (engine.selectedHaloMesh) {
          const pulse = 1 + 0.22 * Math.sin(performance.now() / 420);
          const sizeAttr = engine.selectedHaloMesh.geometry.attributes.size;
          sizeAttr.array[0] = engine._selectedHaloBaseSize * pulse;
          sizeAttr.needsUpdate = true;
        }
        engine.renderer.render(engine.scene, engine.camera);
        engine.map.triggerRepaint();
      },
    };

    this.map.addLayer(customLayer);
    this.customLayer = customLayer;

    // Pointer handling for hover tooltips (raycasting against the point cloud).
    const canvas = this.map.getCanvas();
    this._onPointerMove = (e) => this._handlePointerMove(e);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerleave', () => this.callbacks.onHover?.(null));
  }

  // ---- Selected-quake intensity overlay (region-area fill + station markers) ----
  // Lazily loaded: the 194-feature region polygon set (~16MB) is only fetched
  // once the earthquake browser panel actually selects a quake, not on app
  // startup. Both new layers are inserted *before* the 3D custom layer (via
  // beforeId) so the point cloud stays visually on top of the flat overlay.
  async ensureQuakeIntensityLayers() {
    if (this._destroyed || !this.map) return;
    if (this._quakeLayersReady) return;
    if (!this._quakeLayersPromise) {
      this._quakeLayersPromise = (async () => {
        const regions = await loadQuakeRegions();
        if (this._destroyed) return;
        this.map.addSource('quakeRegions', { type: 'geojson', data: regions, promoteId: 'code' });
        this.map.addLayer(
          {
            id: 'quake-areas-fill',
            type: 'fill',
            source: 'quakeRegions',
            paint: {
              'fill-color': ['coalesce', ['feature-state', 'color'], 'rgba(0,0,0,0)'],
              'fill-opacity': 0.7,
            },
          },
          this.customLayer.id
        );
        this.map.addLayer(
          {
            id: 'quake-areas-line',
            type: 'line',
            source: 'quakeRegions',
            paint: {
              'line-color': 'rgba(0,0,0,0.35)',
              'line-width': ['coalesce', ['feature-state', 'hasIntensity'], 0],
            },
          },
          this.customLayer.id
        );
        this.map.addSource('quakeStations', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
        // No beforeId here (unlike the area fill/line above): this appends
        // the layer to the very top of the stack, so station markers render
        // above the 3D point-cloud custom layer as well as everything else.
        this.map.addLayer({
          id: 'quake-stations-symbol',
          type: 'symbol',
          source: 'quakeStations',
          layout: {
            // ズーム6未満は円が小さく数字が潰れるため、数字なしアイコンに切り替える
            // (MeteoQuakeのstation-points-symbolと同じ挙動)。
            'icon-image': [
              'step', ['zoom'],
              ['concat', 'station-icon-', ['get', 'intensityKey'], '-dot'],
              6, ['concat', 'station-icon-', ['get', 'intensityKey'], '-num'],
            ],
            'icon-size': [
              'interpolate', ['linear'], ['zoom'],
              4, 5 / STATION_ICON_BASE_RADIUS,
              7, 10 / STATION_ICON_BASE_RADIUS,
              9, 14 / STATION_ICON_BASE_RADIUS,
              11, 20 / STATION_ICON_BASE_RADIUS,
              14, 30 / STATION_ICON_BASE_RADIUS,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            // 震度が大きいほど後(=前面)に描画されるよう、sort-keyに震度の並び順を使う。
            'symbol-sort-key': ['get', 'sortOrder'],
          },
        });
        this._paintedAreaCodes = new Set();
        this._quakeLayersReady = true;
      })();
    }
    return this._quakeLayersPromise;
  }

  _ensureStationIcons(colorSchemeId) {
    if (this._quakeIconSchemeId === colorSchemeId) return;
    const scheme = QUAKE_COLOR_SCHEMES[colorSchemeId] || QUAKE_COLOR_SCHEMES.legacy;
    registerStationIcons(this.map, scheme);
    this._quakeIconSchemeId = colorSchemeId;
  }

  /**
   * Paints the felt-area distribution for a selected earthquake: region
   * polygons colored via feature-state (for isArea:true / 震度速報-stage
   * points) and individual station icons (for isArea:false / confirmed
   * points, zoom-adaptive dot⇄numbered badge — see quakeStationIcons.js).
   * `areaColors` is a Map<regionCode, hexColor>; `stationFeatures` is
   * [{ lon, lat, intensityKey }]; `colorSchemeId` selects the badge palette.
   */
  async showQuakeIntensity(areaColors, stationFeatures, colorSchemeId) {
    if (this._destroyed || !this.map) return;
    await this.ensureQuakeIntensityLayers();
    if (this._destroyed || !this.map) return;
    this._ensureStationIcons(colorSchemeId);
    this.clearQuakeIntensity();
    areaColors.forEach((color, code) => {
      this.map.setFeatureState({ source: 'quakeRegions', id: code }, { color, hasIntensity: 1 });
    });
    this._paintedAreaCodes = new Set(areaColors.keys());
    const fc = {
      type: 'FeatureCollection',
      features: stationFeatures.map((p) => ({
        type: 'Feature',
        properties: { intensityKey: p.intensityKey, sortOrder: INTENSITY_ORDER.indexOf(p.intensityKey) },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    };
    this.map.getSource('quakeStations')?.setData(fc);
  }

  clearQuakeIntensity() {
    if (this._destroyed || !this.map) return;
    if (this._paintedAreaCodes) {
      this._paintedAreaCodes.forEach((code) => {
        this.map.setFeatureState({ source: 'quakeRegions', id: code }, { color: null, hasIntensity: 0 });
      });
      this._paintedAreaCodes = new Set();
    }
    this.map.getSource('quakeStations')?.setData(EMPTY_FEATURE_COLLECTION);
  }

  _handlePointerMove(e) {
    if (!this.camera || !this.pointsMesh) {
      this.callbacks.onHover?.(null);
      return;
    }
    const rect = this.map.getCanvas().getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    if (!this._raycaster) this._raycaster = new THREE.Raycaster();
    this._raycaster.params.Points.threshold = POINT_PICK_THRESHOLD;
    this._raycaster.setFromCamera(ndc, this.camera);
    const hits = this._raycaster.intersectObject(this.pointsMesh);
    if (hits.length > 0) {
      const record = this._currentRecords[hits[0].index];
      this.callbacks.onHover?.(record, { x: e.clientX, y: e.clientY });
    } else {
      this.callbacks.onHover?.(null);
    }
  }

  // ---- Data loading ----

  /**
   * Runs the given zero-argument loader (e.g. () => loadRecentQuakes(7) or
   * () => loadQuakesForRange(start, end)) and renders the result. Kept
   * generic so callers decide *what* to load; the engine only cares about
   * the resulting { features, failedDays, requestedDays } shape.
   */
  async loadQuakes(loaderFn) {
    this.callbacks.onStatus?.('loading', 'JMAから震源データを取得しています…');
    try {
      const { features, failedDays, requestedDays } = await loaderFn();
      this.rawFeatures = features;
      this._rebuild();
      this.callbacks.onStatus?.('hidden');
      if (failedDays.length > 0) {
        this.callbacks.onStatus?.(
          'warning',
          `${requestedDays}日中${failedDays.length}日分の取得に失敗しました（${failedDays.join(', ')}）`
        );
      }
      return { failedDays };
    } catch (err) {
      console.error(err);
      this.callbacks.onStatus?.('error', 'データの取得に失敗しました。ネットワーク環境やCORS制限をご確認ください。');
      throw err;
    }
  }

  useSampleData(sampleFeatures) {
    this.rawFeatures = sampleFeatures;
    this._rebuild();
    this.callbacks.onStatus?.('hidden');
  }

  setMinMag(minMag) {
    this.state.minMag = minMag;
    this._rebuild();
  }

  setExaggeration(exaggeration) {
    this.state.exaggeration = exaggeration;
    this._rebuild();
  }

  setShowStems(show) {
    this.state.showStems = show;
    this._rebuild();
  }

  _clearMeshes() {
    if (this.pointsMesh) {
      this.quakeGroup.remove(this.pointsMesh);
      this.pointsMesh.geometry.dispose();
      this.pointsMesh = null;
    }
    if (this.stemsMesh) {
      this.quakeGroup.remove(this.stemsMesh);
      this.stemsMesh.geometry.dispose();
      this.stemsMesh.material.dispose();
      this.stemsMesh = null;
    }
  }

  _rebuild() {
    if (!this.scene) return; // Three layer not ready yet
    this._clearMeshes();

    const filtered = this.rawFeatures.filter(
      (f) => Number.isFinite(f.mag) && f.mag >= this.state.minMag && Number.isFinite(f.depth)
    );

    const n = filtered.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const stemPositions = [];
    const stemColors = [];

    filtered.forEach((f, i) => {
      const altitude = -Math.max(0, f.depth) * DEPTH_METERS_PER_KM * this.state.exaggeration;
      const coord = maplibregl.MercatorCoordinate.fromLngLat([f.lon, f.lat], altitude);
      const [r, g, b] = depthToRgb01(f.depth);

      positions[i * 3] = coord.x;
      positions[i * 3 + 1] = coord.y;
      positions[i * 3 + 2] = coord.z;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
      sizes[i] = pixelSizeForMag(f.mag);

      if (this.state.showStems && f.depth > 3) {
        const surface = maplibregl.MercatorCoordinate.fromLngLat([f.lon, f.lat], 0);
        stemPositions.push(surface.x, surface.y, surface.z, coord.x, coord.y, coord.z);
        stemColors.push(r, g, b, r, g, b);
      }
    });

    if (n > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
      this.pointsMesh = new THREE.Points(geometry, this.pointsMaterial);
      // Positions are absolute Mercator coordinates, not relative to this
      // object's local origin, so default frustum-culling (based on the
      // geometry's bounding sphere around the origin) is meaningless here
      // and can incorrectly cull the whole point cloud.
      this.pointsMesh.frustumCulled = false;
      this.quakeGroup.add(this.pointsMesh);
    }
    this._currentRecords = filtered;

    if (stemPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(stemPositions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(stemColors, 3));
      const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.25,
        depthTest: false,
        depthWrite: false,
      });
      this.stemsMesh = new THREE.LineSegments(geom, material);
      this.stemsMesh.frustumCulled = false;
      this.stemsMesh.renderOrder = -1; // always behind the quake points themselves
      this.quakeGroup.add(this.stemsMesh);
    }

    this.map?.triggerRepaint();
    this._reportStats(filtered);
    this._rebuildSelectedMarker(); // altitude depends on this.state.exaggeration, same as the main cloud
  }

  // ---- Selected-quake hypocenter marker (emphasized halo + core point) ----
  // Plotted the same way as every other point in the cloud (same lon/lat/
  // depth -> Mercator transform, same depth-based color, same
  // magnitude-based sizing via pixelSizeForMag) but larger, more opaque, and
  // with a soft pulsing gold halo behind it so the browsed quake stays easy
  // to spot once the camera has zoomed in among the surrounding cloud.
  setSelectedQuakeHypocenter(record) {
    if (!record || !Number.isFinite(record.lat) || !Number.isFinite(record.lon) || !Number.isFinite(record.depth)) {
      this._selectedQuakeRecord = null;
      this._rebuildSelectedMarker();
      return;
    }
    // 気象庁の震源データを読み込み済みの期間内であれば、その正確な震源で
    // 上書きする(発生時刻・M・深さ・緯度経度が近い記録をrawFeaturesから探す)。
    // 見つからなければP2P地震情報自身の値をそのまま使う。
    const matched = this._findJmaMatch(record);
    this._selectedQuakeRecord = matched
      ? { lat: matched.lat, lon: matched.lon, depth: matched.depth, mag: Number.isFinite(matched.mag) ? matched.mag : record.mag }
      : { lat: record.lat, lon: record.lon, depth: record.depth, mag: record.mag };
    this._rebuildSelectedMarker();
  }

  // Looks for the JMA hypocenter cloud record (rawFeatures — everything
  // currently loaded for the active date range, regardless of the minMag
  // filter) that corresponds to a P2P地震情報 card: same occurrence time
  // (within 90s — P2P and JMA occasionally round differently), and among
  // those, the closest by position/depth/magnitude. Returns null (falls
  // back to the P2P card's own hypocenter) when nothing is loaded for that
  // period or nothing plausibly matches.
  _findJmaMatch(record) {
    if (!record.time || !Array.isArray(this.rawFeatures) || this.rawFeatures.length === 0) return null;
    const cardTime = parseP2pQuakeTime(record.time);
    if (cardTime == null) return null;

    const TIME_TOLERANCE_MS = 90 * 1000;
    let best = null;
    let bestScore = Infinity;
    for (const f of this.rawFeatures) {
      if (f.time == null) continue;
      const dt = Math.abs(f.time - cardTime);
      if (dt > TIME_TOLERANCE_MS) continue;
      const dist = haversineKm(f.lat, f.lon, record.lat, record.lon);
      if (dist > 300) continue; // 明らかに別の地震
      const depthDiff = Number.isFinite(record.depth) ? Math.abs(f.depth - record.depth) : 0;
      const magDiff = Number.isFinite(record.mag) ? Math.abs(f.mag - record.mag) : 0;
      const score = dt / 1000 + dist * 2 + depthDiff * 3 + magDiff * 10;
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  _disposeSelectedMarker() {
    if (this.selectedHaloMesh) {
      this.quakeGroup?.remove(this.selectedHaloMesh);
      this.selectedHaloMesh.geometry.dispose();
      this.selectedHaloMesh = null;
    }
    if (this.selectedCoreMesh) {
      this.quakeGroup?.remove(this.selectedCoreMesh);
      this.selectedCoreMesh.geometry.dispose();
      this.selectedCoreMesh = null;
    }
    if (this.selectedStemMesh) {
      this.quakeGroup?.remove(this.selectedStemMesh);
      this.selectedStemMesh.geometry.dispose();
      this.selectedStemMesh = null;
    }
  }

  _rebuildSelectedMarker() {
    if (!this.scene) return; // Three layer not ready yet
    this._disposeSelectedMarker();

    const rec = this._selectedQuakeRecord;
    if (!rec) return;

    const depth = Math.max(0, rec.depth);
    const mag = Number.isFinite(rec.mag) ? rec.mag : 4; // M不明の地震でも見える大きさにしておく
    const altitude = -depth * DEPTH_METERS_PER_KM * this.state.exaggeration;
    const coord = maplibregl.MercatorCoordinate.fromLngLat([rec.lon, rec.lat], altitude);
    const [r, g, b] = depthToRgb01(depth);
    const baseSize = pixelSizeForMag(mag);
    const position = [coord.x, coord.y, coord.z];

    if (!this.selectedHaloMaterial) {
      this.selectedHaloMaterial = new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX_SHADER,
        fragmentShader: POINT_FRAGMENT_SHADER,
        uniforms: { opacity: { value: 0.75 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // soft glow rather than a flat disc
      });
    }
    this._selectedHaloBaseSize = baseSize * 6.5;
    const haloGeom = new THREE.BufferGeometry();
    haloGeom.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    haloGeom.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1], 3)); // white — reads as "selection", not "shallow"
    haloGeom.setAttribute('size', new THREE.Float32BufferAttribute([this._selectedHaloBaseSize], 1));
    this.selectedHaloMesh = new THREE.Points(haloGeom, this.selectedHaloMaterial);
    this.selectedHaloMesh.frustumCulled = false;
    this.quakeGroup.add(this.selectedHaloMesh);

    if (!this.selectedCoreMaterial) {
      this.selectedCoreMaterial = new THREE.ShaderMaterial({
        vertexShader: POINT_VERTEX_SHADER,
        fragmentShader: POINT_FRAGMENT_SHADER,
        uniforms: { opacity: { value: 0.95 } }, // more opaque than the ambient cloud (0.62) so it doesn't get lost among it
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
    }
    const coreGeom = new THREE.BufferGeometry();
    coreGeom.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    coreGeom.setAttribute('color', new THREE.Float32BufferAttribute([r, g, b], 3)); // same depth color as any other point
    coreGeom.setAttribute('size', new THREE.Float32BufferAttribute([baseSize * 1.7], 1));
    this.selectedCoreMesh = new THREE.Points(coreGeom, this.selectedCoreMaterial);
    this.selectedCoreMesh.frustumCulled = false;
    this.quakeGroup.add(this.selectedCoreMesh);

    // Same "引き出し線" (surface stem) as the ambient cloud draws for its own
    // points — same on/off toggle (state.showStems) and depth cutoff, just
    // brighter, so the selected quake still reads as "one of these dots",
    // consistently, whether stems are on or off.
    if (this.state.showStems && depth > 3) {
      const surface = maplibregl.MercatorCoordinate.fromLngLat([rec.lon, rec.lat], 0);
      if (!this.selectedStemMaterial) {
        this.selectedStemMaterial = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.6,
          depthTest: false,
          depthWrite: false,
        });
      }
      const stemGeom = new THREE.BufferGeometry();
      stemGeom.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([surface.x, surface.y, surface.z, coord.x, coord.y, coord.z], 3)
      );
      stemGeom.setAttribute('color', new THREE.Float32BufferAttribute([r, g, b, r, g, b], 3));
      this.selectedStemMesh = new THREE.LineSegments(stemGeom, this.selectedStemMaterial);
      this.selectedStemMesh.frustumCulled = false;
      this.selectedStemMesh.renderOrder = -1; // behind the point markers, same as the ambient cloud's stems
      this.quakeGroup.add(this.selectedStemMesh);
    }

    this.map?.triggerRepaint();
  }

  // ---- Camera framing for the earthquake browser ----
  // Fits the given [lon, lat] points (hypocenter + every station/area point
  // that recorded shaking) into view. A single point flies in to a fixed
  // regional zoom instead (fitBounds degenerates on a zero-size box).
  // Padding is skewed toward the bottom-right to leave room for the
  // IconDock panel that's showing the quake being framed.
  fitQuakeBounds(coords) {
    if (this._destroyed || !this.map || !Array.isArray(coords) || coords.length === 0) return;

    // The fixed padding below leaves room for the IconDock panel showing
    // the quake being framed (bottom-right on desktop). On a narrow phone
    // viewport those same pixel values can approach or exceed the
    // viewport's own width/height, which makes fitBounds' internal math
    // blow up and center on something far from the actual quake. Scale
    // each side down to a fraction of the current container size instead,
    // so desktop keeps its usual padding while mobile gets a smaller,
    // still-safe margin.
    const el = this.map.getContainer();
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    const padding = {
      top: Math.min(80, h * 0.12),
      bottom: Math.min(170, h * 0.3),
      left: Math.min(60, w * 0.12),
      right: Math.min(330, w * 0.38),
    };

    if (coords.length === 1) {
      this.map.flyTo({ center: coords[0], zoom: Math.max(this.map.getZoom(), 7), duration: 900, padding });
      return;
    }
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    coords.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
    this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, maxZoom: 9, duration: 900 });
  }

  _reportStats(filtered) {
    if (filtered.length === 0) {
      this.callbacks.onStats?.({ count: 0, maxMag: null, latest: null });
      return;
    }
    let maxMag = -Infinity;
    let latest = null;
    filtered.forEach((f) => {
      if (f.mag > maxMag) maxMag = f.mag;
      if (f.time != null && (latest == null || f.time > latest.time)) latest = f;
    });
    this.callbacks.onStats?.({ count: filtered.length, maxMag, latest });
  }

  destroy() {
    this._destroyed = true;
    const canvas = this.map?.getCanvas();
    if (canvas && this._onPointerMove) canvas.removeEventListener('pointermove', this._onPointerMove);
    this._clearMeshes();
    this._disposeSelectedMarker();
    this.selectedHaloMaterial?.dispose();
    this.selectedCoreMaterial?.dispose();
    this.selectedStemMaterial?.dispose();
    this.pointsMaterial?.dispose();
    this.map?.remove();
  }
}
