import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { idbGet, idbSet, STORE_MAP_DATA } from './idb.js';
import { depthToRgb01, pixelSizeForMag } from './color.js';

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
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#060a12' } }],
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
      paint: { 'fill-color': '#141b2b', 'fill-opacity': 0.93 },
    });
    this.map.addLayer({
      id: 'world-line',
      type: 'line',
      source: 'world',
      paint: { 'line-color': '#5a6c99', 'line-width': 0.9, 'line-opacity': 0.8 },
    });

    this.map.addSource('prefectures', { type: 'geojson', data: prefectures });
    this.map.addLayer({
      id: 'pref-fill',
      type: 'fill',
      source: 'prefectures',
      paint: { 'fill-color': '#1c2540', 'fill-opacity': 0.93 },
    });
    this.map.addLayer({
      id: 'pref-line',
      type: 'line',
      source: 'prefectures',
      paint: { 'line-color': '#8494c9', 'line-width': 1.1, 'line-opacity': 0.85 },
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

  async loadRange(days, loaderFn) {
    this.callbacks.onStatus?.('loading', 'JMAから震源データを取得しています…');
    try {
      const { features, failedDays, requestedDays } = await loaderFn(days);
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
    this.pointsMaterial?.dispose();
    this.map?.remove();
  }
}
