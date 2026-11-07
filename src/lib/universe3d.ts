/**
 * universe3d.ts — the 3D "patch of universe" behind the story.
 *
 * Galaxies sit at fixed *comoving* positions on a procedural cosmic web; the
 * whole set (and a comoving grid) is scaled by a display scale s(a) each frame,
 * so scrolling through cosmic time literally stretches space. Early on the
 * points glow as hot plasma, fade through the dark ages, and light up as
 * galaxies. At recombination a sphere carrying a CMB sky appears, and a
 * comoving ruler (1 Gly today) stretches with everything else.
 */
import * as THREE from 'three';

export interface UniverseState {
  /** display scale (≈ a^0.4, 1 today) */
  scale: number;
  /** 0..1 hot opaque plasma (before recombination) */
  hot: number;
  /** 0..1 galaxies lit (after the dark ages) */
  stars: number;
  /** 0..1 how far the scene is pushed aside for the chart panel */
  aside: number;
  /** true on narrow screens: push the scene up instead of left */
  vertical: boolean;
  /** 0..1 the last-scattering sphere (CMB sky) */
  cmb: number;
  /** 0..1 the comoving ruler under the patch */
  ruler: number;
}

/** where the ruler is on screen this frame, in CSS pixels of the canvas */
export interface RulerFrame {
  x1: number;
  x2: number;
  y: number;
  opacity: number;
}

/** length of the ruler in scene units; one unit is 1 Gly comoving */
export const RULER_UNITS = 1;

const VERT = /* glsl */ `
  uniform float uScale;
  uniform float uSize;
  uniform float uPR;
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position * uScale, 1.0);
    gl_Position = projectionMatrix * mv;
    // galaxies keep their apparent size; very early the whole patch is a dot
    float shrink = clamp(uScale * 3.0, 0.25, 1.0);
    gl_PointSize = aSize * uSize * uPR * shrink * (14.0 / -mv.z);
    vColor = aColor;
    vSeed = aSeed;
  }
`;

const FRAG = /* glsl */ `
  uniform float uHot;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d2 = dot(q, q);
    if (d2 > 0.25) discard;
    float core = exp(-d2 * 60.0);
    float halo = exp(-d2 * 12.0) * 0.35;
    float twinkle = 0.85 + 0.15 * sin(uTime * 1.7 + vSeed * 40.0);
    vec3 plasma = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.86, 0.62), vSeed);
    vec3 gas = vec3(0.22, 0.26, 0.42) * 0.35;
    vec3 c = mix(gas, vColor * twinkle, uStars);
    c = mix(c, plasma, uHot);
    float a = core + halo;
    gl_FragColor = vec4(c * a, a);
  }
`;

const CMB_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const CMB_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uReady;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 sky = mix(vec3(0.95, 0.62, 0.35), texture2D(uMap, vUv).rgb, uReady);
    float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
    float rim = pow(f, 2.2);
    vec3 c = sky * (0.82 + 0.35 * rim) + vec3(1.0, 0.72, 0.48) * rim * 0.45;
    gl_FragColor = vec4(c, uOpacity);
  }
`;

const GRID_VERT = /* glsl */ `
  uniform float uScale;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position * uScale, 1.0);
    gl_Position = projectionMatrix * mv;
    vFade = clamp(1.0 - length(position) / 1.9, 0.0, 1.0);
  }
`;
const GRID_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vFade;
  void main() { gl_FragColor = vec4(0.55, 0.68, 1.0, uOpacity * vFade); }
`;

/** deterministic PRNG */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd: () => number) {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** procedural cosmic web: clusters at nodes, filaments between near neighbours, a sprinkle of field galaxies */
function buildWeb(n: number) {
  const rnd = mulberry(1307);
  const R = 1.6;
  const nodes: THREE.Vector3[] = [];
  while (nodes.length < 46) {
    const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (v.length() <= 1) nodes.push(v.multiplyScalar(R));
  }
  const edges: [number, number][] = [];
  nodes.forEach((a, i) => {
    const near = nodes
      .map((b, j) => ({ j, d: a.distanceTo(b) }))
      .filter((o) => o.j !== i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 3);
    for (const o of near) if (i < o.j && o.d < 1.2) edges.push([i, o.j]);
  });

  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const seed = new Float32Array(n);
  const palette = [
    new THREE.Color('#dfe7ff'),
    new THREE.Color('#a9c4ff'),
    new THREE.Color('#ffe2b8'),
    new THREE.Color('#c9b8ff'),
    new THREE.Color('#ffffff'),
  ];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = rnd();
    let big = false;
    if (r < 0.22) {
      // cluster
      const c = nodes[Math.floor(rnd() * nodes.length)];
      const sc = 0.06 + rnd() * 0.05;
      tmp.set(c.x + gauss(rnd) * sc, c.y + gauss(rnd) * sc, c.z + gauss(rnd) * sc);
      big = rnd() < 0.25;
    } else if (r < 0.9 && edges.length) {
      // filament
      const [a, b] = edges[Math.floor(rnd() * edges.length)];
      const f = rnd();
      tmp.lerpVectors(nodes[a], nodes[b], f);
      const sc = 0.035;
      tmp.x += gauss(rnd) * sc;
      tmp.y += gauss(rnd) * sc;
      tmp.z += gauss(rnd) * sc;
    } else {
      // field
      do tmp.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      while (tmp.length() > 1);
      tmp.multiplyScalar(R);
    }
    pos.set([tmp.x, tmp.y, tmp.z], i * 3);
    const c = palette[Math.floor(rnd() * palette.length)];
    const rr = tmp.length() / R;
    const k = (0.55 + rnd() * 0.45) * Math.exp(-Math.pow(rr, 4) * 1.6);
    col.set([c.r * k, c.g * k, c.b * k], i * 3);
    size[i] = big ? 3.2 + rnd() * 2 : 0.8 + rnd() * rnd() * 2.2;
    seed[i] = rnd();
  }
  return { pos, col, size, seed };
}

function buildGrid() {
  const pts: number[] = [];
  const L = 1.8;
  const steps = [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8];
  for (const a of steps)
    for (const b of steps) {
      pts.push(-L, a, b, L, a, b);
      pts.push(a, -L, b, a, L, b);
      pts.push(a, b, -L, a, b, L);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,150,90,0)');
  g.addColorStop(0.55, 'rgba(255,170,110,0.55)');
  g.addColorStop(0.72, 'rgba(255,120,70,0.25)');
  g.addColorStop(1, 'rgba(200,60,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,240,215,1)');
  g.addColorStop(0.18, 'rgba(255,190,120,0.85)');
  g.addColorStop(0.45, 'rgba(230,100,40,0.35)');
  g.addColorStop(1, 'rgba(160,40,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Universe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
  private group = new THREE.Group();
  private points: THREE.Points;
  private grid: THREE.LineSegments;
  private glow: THREE.Sprite;
  private flash: THREE.Sprite;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private skyTex: THREE.Texture | null = null;
  private mat: THREE.ShaderMaterial;
  private gridMat: THREE.ShaderMaterial;
  private last = performance.now();
  private elapsed = 0;
  private raf = 0;
  private ro: ResizeObserver;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private state: UniverseState = { scale: 1, hot: 0, stars: 1, aside: 0, vertical: false, cmb: 0, ruler: 0 };
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  /** called after every render with the ruler's screen position */
  onFrame: ((f: RulerFrame) => void) | null = null;
  private shown = { ...this.state };
  private reduced: boolean;
  private w = 1;
  private h = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { cmbUrl?: string } = {},
  ) {
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0.9, window.innerWidth < 760 ? 11 : 7.4);
    this.camera.lookAt(0, 0, 0);

    const narrow = window.innerWidth < 760;
    const web = buildWeb(narrow ? 8000 : 15000);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(web.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(web.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(web.size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(web.seed, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uScale: { value: 1 },
        uSize: { value: 2.4 },
        uPR: { value: this.renderer.getPixelRatio() },
        uHot: { value: 0 },
        uStars: { value: 1 },
        uTime: { value: 0 },
      },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.group.add(this.points);

    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 1 }, uOpacity: { value: 0.07 } },
    });
    this.grid = new THREE.LineSegments(buildGrid(), this.gridMat);
    this.group.add(this.grid);

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    );
    this.scene.add(this.glow);
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    );
    this.scene.add(this.flash);

    // the surface of last scattering: a sphere wearing a (simulated) CMB sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: CMB_VERT,
      fragmentShader: CMB_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: null }, uOpacity: { value: 0 }, uReady: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), this.skyMat);
    this.sky.visible = false;
    this.sky.renderOrder = 2;
    this.group.add(this.sky);
    if (opts.cmbUrl) {
      new THREE.TextureLoader().load(opts.cmbUrl, (tex) => {
        tex.colorSpace = THREE.NoColorSpace; // written straight to the screen, like the other shaders
        tex.anisotropy = 4;
        this.skyTex = tex;
        this.skyMat.uniforms.uMap.value = tex;
        this.skyMat.uniforms.uReady.value = 1;
      });
    }
    this.scene.add(this.group);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.loop();
  }

  private onPointer = (e: PointerEvent) => {
    this.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };

  set(s: Partial<UniverseState>) {
    Object.assign(this.state, s);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const nowMs = performance.now();
    const dt = Math.min((nowMs - this.last) / 1000, 0.05);
    this.last = nowMs;
    this.elapsed += dt;
    const t = this.elapsed;
    const k = 1 - Math.pow(0.0008, dt); // frame-rate independent smoothing
    const S = this.state;
    const D = this.shown;
    // scale eases in log space so the Big Bang end stays smooth
    D.scale = Math.exp(Math.log(D.scale) + (Math.log(Math.max(S.scale, 1e-4)) - Math.log(D.scale)) * k);
    D.hot += (S.hot - D.hot) * k;
    D.stars += (S.stars - D.stars) * k;
    D.aside += (S.aside - D.aside) * k;
    D.cmb += (S.cmb - D.cmb) * k;
    D.ruler += (S.ruler - D.ruler) * k;
    D.vertical = S.vertical;

    const u = this.mat.uniforms;
    u.uScale.value = D.scale;
    u.uHot.value = D.hot;
    u.uStars.value = D.stars;
    u.uTime.value = t;
    this.gridMat.uniforms.uScale.value = D.scale;
    this.gridMat.uniforms.uOpacity.value = 0.03 + 0.06 * (1 - D.hot);

    // plasma fireball: big and bright while hot, never smaller than a spark
    const gs = Math.max(D.scale * 9, 0.9 + D.hot * 1.5);
    this.glow.scale.set(gs, gs, 1);
    (this.glow.material as THREE.SpriteMaterial).opacity = Math.min(1, D.hot * 1.1) * (1 - 0.55 * D.cmb);
    // the light set free at recombination: a shell that races outward and fades
    const release = 1 - D.hot;
    const fs = gs * (1.2 + 5 * release);
    this.flash.scale.set(fs, fs, 1);
    (this.flash.material as THREE.SpriteMaterial).opacity = Math.max(0, 4 * D.hot * release) * 0.9 * (1 - 0.7 * D.cmb);

    // last-scattering sphere: swells into view, then thins out as the chapter ends
    const show = D.cmb > 0.01;
    this.sky.visible = show;
    if (show) {
      const r = (0.55 + 0.75 * D.cmb) * (D.vertical ? 0.7 : 1);
      this.sky.scale.set(r, r, r);
      this.skyMat.uniforms.uOpacity.value = Math.min(1, D.cmb * 1.1);
    }

    // gentle drift + pointer parallax
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.04;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.04;
    const spin = this.reduced ? 0 : t * 0.035;
    this.group.rotation.y = spin + this.pointer.x * 0.35;
    this.group.rotation.x = 0.12 + this.pointer.y * 0.18;

    // push the scene aside for the chart panel (view offset keeps perspective centred on the scene)
    if (D.vertical) {
      this.camera.setViewOffset(this.w, this.h, 0, this.h * 0.22 * D.aside, this.w, this.h);
    } else {
      this.camera.setViewOffset(this.w, this.h, this.w * 0.23 * D.aside, 0, this.w, this.h);
    }
    this.renderer.render(this.scene, this.camera);

    if (this.onFrame) {
      // a screen-aligned ruler under the patch, scaled with space (not with the spin)
      const half = (RULER_UNITS / 2) * D.scale;
      const y = 1.98 * D.scale;
      this.tmpA.set(-half, y, 0.4 * D.scale).project(this.camera);
      this.tmpB.set(half, y, 0.4 * D.scale).project(this.camera);
      this.onFrame({
        x1: ((this.tmpA.x + 1) / 2) * this.w,
        x2: ((this.tmpB.x + 1) / 2) * this.w,
        y: ((1 - this.tmpA.y) / 2) * this.h,
        opacity: D.ruler * (1 - D.hot) * (1 - D.cmb),
      });
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.points.geometry.dispose();
    this.grid.geometry.dispose();
    this.sky.geometry.dispose();
    this.skyTex?.dispose();
    this.skyMat.dispose();
    this.mat.dispose();
    this.gridMat.dispose();
    this.renderer.dispose();
  }
}
