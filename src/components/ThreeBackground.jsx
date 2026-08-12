import React, { useEffect, useRef } from "react";
import { NAV_LINKS } from "../data/projects";

const PAPER = 0xf4f1e8;
const RUST = 0x7a2b22;

/* Frame-rate-independent exponential smoothing — replaces the classic
   `current += (target - current) * fixedFactor` mistake, which visibly
   changes speed depending on the display's refresh rate. `lambda` is
   roughly "how many times per second it closes the gap"; higher = snappier. */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
function dampVec3(vec, target, lambda, dt) {
  vec.x = damp(vec.x, target.x, lambda, dt);
  vec.y = damp(vec.y, target.y, lambda, dt);
  vec.z = damp(vec.z, target.z, lambda, dt);
}

/* Cheap, dependency-free check for whether WebGL is actually usable */
function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch (e) {
    return false;
  }
}

export default function ThreeBackground({ scrollRef, reducedMotion, onUnavailable, activity, triggerRef, pilotMode, onSecretFound, contentRef }) {
  const mountRef = useRef(null);
  const shockwaveRef = useRef({ time: 100, x: 0, y: 0, active: false });
  const scrollVelocity = useRef(0);
  const lastScrollY = useRef(0);
  const activityRef = useRef(activity);
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);
  const pilotModeRef = useRef(pilotMode);
  useEffect(() => {
    pilotModeRef.current = pilotMode;
  }, [pilotMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (!isWebGLAvailable()) {
      onUnavailable?.();
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    import("three").then(async (THREE) => {
      if (cancelled) return;

      let width = mount.clientWidth;
      let height = mount.clientHeight;

      const { CSS3DRenderer, CSS3DObject } = await import("three/examples/jsm/renderers/CSS3DRenderer.js");
      if (cancelled) return;

      const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b0a, 0.05);

    // A parallel scene for the page's own sections, rendered by a separate
    // DOM-based renderer (below) so pilot mode can fly through real, styled
    // content — the actual site, not a stand-in mesh — rather than compositing
    // it into the WebGL scene.
    const cssScene = new THREE.Scene();

    // The sections live on a single rotating body, the same idea as the
    // ink blob — one entity you orbit and see every face of, not a strip
    // of panels bolted in a line.
    const contentGroup = new THREE.Group();
    cssScene.add(contentGroup);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    // A designed flythrough path rather than a straight dolly — scroll
    // position samples along this curve instead of lerping z/y directly.
    const cameraCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 9),
      new THREE.Vector3(0.6, -0.3, 5.5),
      new THREE.Vector3(-0.4, -0.9, 1.5),
      new THREE.Vector3(0, -1.4, -4),
    ]);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      onUnavailable?.();
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(width, height);
    cssRenderer.domElement.style.position = "absolute";
    cssRenderer.domElement.style.top = "0";
    cssRenderer.domElement.style.left = "0";
    cssRenderer.domElement.style.pointerEvents = "none";
    mount.appendChild(cssRenderer.domElement);
    let contentPanels = [];

    // Manual post-processing pass (no examples/jsm dependency): render the
    // scene to a target, then composite through a single shader doing a
    // touch of chromatic aberration, a vignette, and film grain.
    const renderTarget = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
    const postScene = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: renderTarget.texture },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uLensCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uLensStrength: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uLensCenter;
        uniform float uLensStrength;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }
        void main() {
          vec2 uv = vUv;

          // Gravitational lensing: bend the sampled UVs around the blob's
          // screen position, the way real light curves past a real mass.
          vec2 toLens = uv - uLensCenter;
          float lensDist = length(toLens);
          float bend = min(uLensStrength / (lensDist * lensDist * 12.0 + 0.15), 0.06);
          vec2 lensedUv = lensDist > 0.0001 ? uv - (toLens / lensDist) * bend : uv;

          vec2 center = uv - 0.5;
          float dist = length(center);
          vec2 dir = dist > 0.0001 ? normalize(center) : vec2(0.0);
          float aberration = dist * 0.004;
          float r = texture2D(tDiffuse, lensedUv - dir * aberration).r;
          float g = texture2D(tDiffuse, lensedUv).g;
          float b = texture2D(tDiffuse, lensedUv + dir * aberration).b;
          vec3 color = vec3(r, g, b);
          float vignette = smoothstep(0.9, 0.25, dist);
          color *= mix(0.5, 1.0, vignette);
          float grain = (hash(uv * uResolution.xy + uTime) - 0.5) * 0.035;
          color += grain;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
    postScene.add(postQuad);

    const world = new THREE.Group();
    scene.add(world);

    // --- ink blob: displaced wireframe icosahedron ---
    const blobGeo = new THREE.IcosahedronGeometry(2.1, 4);
    const posAttr = blobGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      const n =
        Math.sin(v.x * 1.8 + v.z * 0.6) *
        Math.cos(v.y * 1.4 - v.x * 0.5) *
        Math.sin(v.z * 2.0 + v.y * 0.8);
      const dir = v.clone().normalize();
      v.addScaledVector(dir, n * 0.35);
      posAttr.setXYZ(i, v.x, v.y, v.z);
    }
    blobGeo.computeVertexNormals();
    const blobMat = new THREE.MeshBasicMaterial({
      color: PAPER,
      wireframe: true,
      transparent: true,
      opacity: 0.32,
    });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    world.add(blob);

    // --- brush strokes: hand-placed tube curves ---
    const strokeDefs = [PAPER, PAPER, RUST, PAPER, PAPER];
    const strokes = [];
    strokeDefs.forEach((color, i) => {
      const cx = (Math.random() - 0.5) * 9;
      const cy = (Math.random() - 0.5) * 5.5;
      const cz = (Math.random() - 0.5) * 6 - 3;
      const pts = [];
      for (let j = 0; j < 5; j++) {
        pts.push(
          new THREE.Vector3(
            cx + (Math.random() - 0.5) * 2.6,
            cy + (Math.random() - 0.5) * 2.6,
            cz + (Math.random() - 0.5) * 2.6
          )
        );
      }
      const strokeCurve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(strokeCurve, 48, 0.018 + Math.random() * 0.02, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: i === 2 ? 0.65 : 0.4,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.userData.speed = 0.04 + Math.random() * 0.07;
      tube.userData.originalOpacity = i === 2 ? 0.65 : 0.4;
      world.add(tube);
      strokes.push(tube);
    });

    // --- particle field: a real N-body gravity system, not a scripted
    // animation. Every particle is pulled toward the blob (the dominant
    // mass) and weakly toward every other particle via full O(n^2) pairwise
    // gravity — no Barnes-Hut, no spatial partitioning, on purpose. Fine at
    // 260 particles (~34k pairs/frame) on a desktop CPU; scaled down on
    // small/touch screens below, where that cost actually matters.
    const GRAV_BLOB = 5.5;
    const GRAV_MUTUAL = 0.15;
    const GRAV_POINTER = 3.5;
    const GRAV_SOFTEN = 1.1; // avoids the classic N-body singularity at r -> 0

    // Mutual gravity is O(n^2) — fine at 260 particles on a desktop GPU/CPU,
    // but that's ~34k pairs/frame, real cost on a phone's CPU and battery.
    // Cut it down on small/coarse-pointer screens rather than eating that
    // cost everywhere just because the desktop case is cheap to ignore.
    const isSmallScreen = window.innerWidth < 720 || window.matchMedia("(pointer: coarse)").matches;
    const particleCount = isSmallScreen ? 110 : 260;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const radius = 3 + Math.random() * 11;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const px = radius * Math.sin(phi) * Math.cos(theta);
      const py = radius * Math.sin(phi) * Math.sin(theta) * 0.7; // flattens toward a disk
      const pz = radius * Math.cos(phi);
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;

      // Tangential starting velocity so this reads as an orbiting system
      // from frame one, not a slow collapse — real mutual gravity will
      // perturb these into something messier (and more alive) over time.
      const toCenter = new THREE.Vector3(px, py, pz);
      const r = Math.max(toCenter.length(), 0.001);
      let tangent = new THREE.Vector3().crossVectors(toCenter, new THREE.Vector3(0, 1, 0));
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
      tangent.normalize();
      const orbitalSpeed = Math.sqrt(GRAV_BLOB / (r + GRAV_SOFTEN)) * (0.7 + Math.random() * 0.6);
      velocities[i * 3] = tangent.x * orbitalSpeed;
      velocities[i * 3 + 1] = tangent.y * orbitalSpeed;
      velocities[i * 3 + 2] = tangent.z * orbitalSpeed;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: PAPER,
      size: 0.032,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    world.add(particles);

    // --- cursor trail ---
    const trailCount = 18;
    const trailDots = [];
    for (let i = 0; i < trailCount; i++) {
       const dotGeo = new THREE.CircleGeometry(0.045 * (1 - i/trailCount), 12);
       const dotMat = new THREE.MeshBasicMaterial({ 
           color: RUST, 
           transparent: true, 
           opacity: 0.8 * (1 - i/trailCount),
           depthTest: false,
           depthWrite: false
       });
       const dot = new THREE.Mesh(dotGeo, dotMat);
       dot.renderOrder = 999;
       dot.position.set(0, 0, -100);
       scene.add(dot);
       trailDots.push(dot);
    }

    // --- pointer parallax & interactions ---
    const pointer = { x: 0, y: 0 };
    const raycaster = new THREE.Raycaster();
    // Raw mouse-movement deltas, accumulated between frames — used for
    // pilot-mode steering while the pointer is locked (see animate()).
    const mouseDelta = { x: 0, y: 0 };
    function onPointerMove(e) {
      if (document.pointerLockElement) {
        mouseDelta.x += e.movementX || 0;
        mouseDelta.y += e.movementY || 0;
        return;
      }
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    }
    window.addEventListener("pointermove", onPointerMove);

    function fireShockwave(nx, ny) {
      shockwaveRef.current = { time: 0, x: nx, y: ny, active: true };
    }
    if (triggerRef) triggerRef.current = fireShockwave;

    function onClick(e) {
      fireShockwave((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    }
    window.addEventListener("click", onClick);

    // --- pilot mode: free-flight through the gravity sim ---
    // Mouse position doubles as the flight stick (offset from screen
    // center = steer), WASD/arrows + space/shift are thrust. No pointer
    // lock — keeps the existing cursor/UI plumbing untouched.
    const SHIP_KEYS = new Set([
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
      "Space", "ShiftLeft", "ShiftRight",
    ]);
    const keys = {};
    function onKeyDown(e) {
      if (pilotModeRef.current && SHIP_KEYS.has(e.code)) e.preventDefault();
      keys[e.code] = true;
    }
    function onKeyUp(e) {
      keys[e.code] = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const SHIP_ACCEL = 14;
    const SHIP_MAX_SPEED = 11;
    // Per-second drag (fraction of velocity kept each second), not a fixed
    // per-frame multiplier — see the dt-scaled use below. A monitor at
    // 144Hz used to apply the old per-frame drag 2.4x more often than a
    // 60Hz one, making the ship feel stickier on high-refresh displays.
    const SHIP_DRAG_PER_SEC = 0.4;
    const STEER_RATE = 2.6; // radians/sec at full mouse deflection (position-based fallback only)
    const MOUSE_SENSITIVITY = 0.0026; // radians per pixel of raw mouse movement (pointer-lock steering)
    // Close to straight up/down (just short of the pole, to keep "forward"
    // well-defined) — thrust is always along where the nose is pointed, so
    // aiming the nose up and holding thrust is itself the climb control.
    const PITCH_LIMIT = 1.55;
    const ship = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, throttle: 0 };
    let wasPiloting = false;
    camera.rotation.order = "YXZ";

    /* --- touch flight controls ---
       Pointer lock doesn't exist on a phone and the position-based fallback
       is useless there (a tap sets an absolute pointer position and the ship
       then spins forever), so touch gets its own scheme: drag anywhere to
       steer, hold THRUST to fly. Drag deltas feed the same accumulator the
       pointer-lock path uses, so all the steering maths is shared and
       already proven — only the sensitivity differs, since a thumb drags far
       fewer pixels than a mouse. */
    const isTouchDevice =
      window.matchMedia?.("(pointer: coarse)").matches ||
      "ontouchstart" in window;
    const TOUCH_SENSITIVITY = 0.0075; // radians per pixel of finger travel
    const TOUCH_DELTA_SCALE = TOUCH_SENSITIVITY / MOUSE_SENSITIVITY;
    let touchMode = false; // latched once the user actually flies by touch
    const steerTouch = { id: null, x: 0, y: 0 };

    function onTouchStart(e) {
      if (!pilotModeRef.current) return;
      touchMode = true;
      if (steerTouch.id !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      steerTouch.id = t.identifier;
      steerTouch.x = t.clientX;
      steerTouch.y = t.clientY;
    }
    function onTouchMove(e) {
      if (!pilotModeRef.current || steerTouch.id === null) return;
      // Body overflow is already hidden in pilot mode, but iOS still
      // rubber-band scrolls the page unless the move is cancelled outright.
      if (e.cancelable) e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== steerTouch.id) continue;
        mouseDelta.x += (t.clientX - steerTouch.x) * TOUCH_DELTA_SCALE;
        mouseDelta.y += (t.clientY - steerTouch.y) * TOUCH_DELTA_SCALE;
        steerTouch.x = t.clientX;
        steerTouch.y = t.clientY;
      }
    }
    function onTouchEnd(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === steerTouch.id) steerTouch.id = null;
      }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    // --- the ship itself: a low-poly wireframe dart matching the blob's
    // ink-line language, with animated twin-engine combustion cones ---
    const shipGroup = new THREE.Group();
    shipGroup.visible = false;
    scene.add(shipGroup);

    const hullMat = new THREE.MeshBasicMaterial({ color: PAPER, wireframe: true, transparent: true, opacity: 0.9 });
    const trimMat = new THREE.MeshBasicMaterial({ color: RUST, wireframe: true, transparent: true, opacity: 0.85 });

    const bodyGeo = new THREE.ConeGeometry(0.16, 0.75, 6);
    bodyGeo.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, hullMat);
    shipGroup.add(body);

    const cockpitGeo = new THREE.IcosahedronGeometry(0.075, 0);
    const cockpit = new THREE.Mesh(cockpitGeo, new THREE.MeshBasicMaterial({ color: RUST, transparent: true, opacity: 0.8 }));
    cockpit.position.set(0, 0.05, -0.18);
    shipGroup.add(cockpit);

    const wingGeo = new THREE.BoxGeometry(0.55, 0.02, 0.26);
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(wingGeo, trimMat);
      wing.position.set(side * 0.3, -0.02, 0.12);
      wing.rotation.z = side * 0.08;
      shipGroup.add(wing);
    });

    const nozzleGeo = new THREE.CylinderGeometry(0.055, 0.07, 0.14, 8);
    const flameGeo = new THREE.ConeGeometry(0.06, 0.34, 8, 1, true);
    const engines = [-1, 1].map((side) => {
      const nozzle = new THREE.Mesh(nozzleGeo, hullMat);
      nozzle.position.set(side * 0.13, 0, 0.34);
      nozzle.rotation.x = Math.PI / 2;
      shipGroup.add(nozzle);

      const flameInner = new THREE.Mesh(
        flameGeo,
        new THREE.MeshBasicMaterial({ color: 0xf4e4c9, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      const flameOuter = new THREE.Mesh(
        flameGeo,
        new THREE.MeshBasicMaterial({ color: RUST, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      [flameInner, flameOuter].forEach((f, i) => {
        f.rotation.x = Math.PI / 2;
        f.position.set(side * 0.13, 0, 0.42 + i * 0.02);
        f.scale.setScalar(i === 0 ? 0.85 : 1.15);
        shipGroup.add(f);
      });
      return { flameInner, flameOuter };
    });

    // --- navigation beacons: one per nav section, spread around the scene.
    // Purely physical markers — flying close bounces the ship off rather
    // than jumping to that section, same as any other obstacle out here.
    const DOCK_RADIUS = 1.0;
    const BEACON_BOUNCE_FORCE = 22.0;
    const beacons = NAV_LINKS.map((link, i) => {
      const angle = (i / NAV_LINKS.length) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(angle) * 9, Math.sin(angle * 1.7) * 3.2, Math.sin(angle) * 9 - 1);
      const group = new THREE.Group();
      group.position.copy(pos);
      group.visible = false;

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.03, 8, 24),
        new THREE.MeshBasicMaterial({ color: RUST, transparent: true, opacity: 0.85 })
      );
      group.add(ring);

      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.17, 0),
        new THREE.MeshBasicMaterial({ color: PAPER, wireframe: true, transparent: true, opacity: 0.9 })
      );
      group.add(core);

      scene.add(group);
      return { id: link.id, label: link.label, group, ring, core };
    });

    // A hidden 5th marker, deliberately off the normal beacons' plane and
    // undersized/dim — no ring, no HUD entry, no compass arrow. It doesn't
    // navigate anywhere; finding it is the entire point. Rewards flying
    // somewhere nobody told you to look, rather than reading nav labels.
    const SECRET_DOCK_RADIUS = 1.3;
    const secretBeacon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: PAPER, wireframe: true, transparent: true, opacity: 0.3 })
    );
    secretBeacon.position.set(9, 7, -9);
    secretBeacon.visible = false;
    scene.add(secretBeacon);
    let secretDocked = false;

    // --- black hole / solar system: fly into the blob's core and the
    // ink-brush theme gives way to an actual colorful solar system, the
    // payoff for diving in rather than just orbiting it. A portal ring
    // brings you back the same way, restoring everything exactly as it was.
    const BLACKHOLE_TRIGGER_RADIUS = 2.2;
    const DIVE_RATE = 1.1; // progress/sec once inside the trigger radius
    const CAPTURE_RADIUS = 5.5; // where the core's pull starts to be felt
    const CAPTURE_ACCEL = 9; // below SHIP_ACCEL, so full thrust always escapes
    const SOLAR_SYSTEM_ARRIVAL = new THREE.Vector3(0, 2, 15);
    const PORTAL_POSITION = new THREE.Vector3(3, 2, 15);
    const PORTAL_RADIUS = 1.3;
    let inSolarSystem = false;
    let diveProgress = 0;
    let flashOpacity = 0;
    let captured = false; // past the horizon — thrust no longer saves you
    // Ship spawn keeps continuity with wherever the scroll camera currently
    // is, so entering pilot mode can start you as close as ~1.8 units from
    // the origin — inside the horizon itself at some scroll positions. A
    // fixed grace timer was tried and rejected: it only delayed the fall by
    // a second, so a player who read the HUD and did nothing still got
    // yanked into an unrequested warp with zero input. Gravity now arms on
    // the player's first actual thrust input instead — sitting still never
    // triggers it, at any spawn distance, for any length of time.
    let hasThrustedSinceEntry = false;

    /* Value noise + fBm, used to paint every planet's surface procedurally.
       Textures are generated rather than fetched so the whole thing stays a
       single self-contained bundle with no image requests. */
    function hash2(x, y) {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    }
    function valueNoise(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      const a = hash2(xi, yi);
      const b = hash2(xi + 1, yi);
      const c = hash2(xi, yi + 1);
      const d = hash2(xi + 1, yi + 1);
      return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    }
    function fbm(x, y, octaves) {
      let sum = 0;
      let amp = 0.5;
      let freq = 1;
      for (let o = 0; o < octaves; o++) {
        sum += valueNoise(x * freq, y * freq) * amp;
        freq *= 2;
        amp *= 0.5;
      }
      return sum;
    }
    function mixHex(a, b, t) {
      const ar = (a >> 16) & 255;
      const ag = (a >> 8) & 255;
      const ab = a & 255;
      const br = (b >> 16) & 255;
      const bg = (b >> 8) & 255;
      const bb = b & 255;
      return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
    }

    /* Equirectangular surface map. `bands` gives gas giants their latitudinal
       jet streams (noise stretched hard in x); low `bands` gives rocky worlds
       blotchy continents. Wrapping in x is handled by sampling noise on a
       cylinder so the seam behind the planet doesn't show. */
    function makePlanetTexture(def) {
      const w = 256;
      const h = 128;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(w, h);
      const ramp = def.ramp;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const lon = (x / w) * Math.PI * 2;
          // Sample on a cylinder so x wraps seamlessly around the sphere.
          const nx = Math.cos(lon) * 2.2;
          const nz = Math.sin(lon) * 2.2;
          const ny = (y / h) * def.bands;
          let n = fbm(nx + nz * 0.5, ny, 5);
          if (def.bands > 4) n = n * 0.55 + Math.sin(ny * 2.5 + n * 3) * 0.22 + 0.28;
          n = Math.max(0, Math.min(1, n));
          // Poles run colder/brighter on every body — a cheap but convincing cue.
          const lat = Math.abs(y / h - 0.5) * 2;
          const polar = Math.max(0, lat - (def.iceCap ?? 0.78)) / 0.22;
          const t = Math.max(0, Math.min(1, n));
          const stops = ramp.length - 1;
          const seg = Math.min(stops - 1, Math.floor(t * stops));
          const local = t * stops - seg;
          const rgb = mixHex(ramp[seg], ramp[seg + 1], local);
          const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);
          let r = +m[1];
          let g = +m[2];
          let b = +m[3];
          if (polar > 0) {
            const p = Math.min(1, polar);
            r += (238 - r) * p;
            g += (245 - g) * p;
            b += (255 - b) * p;
          }
          const i = (y * w + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    /* Saturn-style rings: concentric bands of varying brightness with real
       gaps punched through the alpha channel, drawn into a 1px-tall strip
       that the ring geometry samples radially. */
    function makeRingTexture(color) {
      const w = 256;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(w, 1);
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      const b = color & 255;
      for (let x = 0; x < w; x++) {
        const t = x / w;
        let a = 0.55 + Math.sin(t * 42) * 0.2 + fbm(t * 18, 0, 3) * 0.35;
        // Cassini-like divisions.
        if (t < 0.12 || t > 0.97) a = 0;
        if (t > 0.55 && t < 0.61) a *= 0.15;
        if (t > 0.78 && t < 0.81) a *= 0.3;
        const shade = 0.7 + fbm(t * 30, 5, 3) * 0.5;
        const i = x * 4;
        img.data[i] = Math.min(255, r * shade);
        img.data[i + 1] = Math.min(255, g * shade);
        img.data[i + 2] = Math.min(255, b * shade);
        img.data[i + 3] = Math.max(0, Math.min(1, a)) * 255;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    // Radial falloff sprite, reused for the sun's corona and the nebulae.
    function makeGlowTexture(inner, outer) {
      const s = 128;
      const canvas = document.createElement("canvas");
      canvas.width = s;
      canvas.height = s;
      const ctx = canvas.getContext("2d");
      const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, inner);
      grad.addColorStop(0.35, outer);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    /* The sun is the only light source in here, so planets get a real lit
       limb and a dark night side — the single biggest realism win over the
       previous flat MeshBasicMaterial spheres. True inverse-square falloff
       (decay 2) blows out the inner worlds while leaving the outer ones
       black, so this uses a gentler decay: still an obvious "closer is
       brighter" cue, but every planet stays readable. */
    const sunLight = new THREE.PointLight(0xfff0d0, 26, 0, 1);
    sunLight.visible = false;
    scene.add(sunLight);
    // Faint fill so night sides read as dark blue rather than pure black.
    const starFill = new THREE.AmbientLight(0x2b3a58, 0.9);
    starFill.visible = false;
    scene.add(starFill);

    const sun = new THREE.Group();
    sun.visible = false;
    sun.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 48, 32), new THREE.MeshBasicMaterial({ color: 0xfff6e2 })));
    // Two glow shells: a tight photosphere bloom over a broad, faint corona,
    // which reads far more like a star than one big soft disc.
    const coronaInner = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture("rgba(255,252,240,0.9)", "rgba(255,196,110,0.5)"),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      })
    );
    coronaInner.scale.setScalar(3.6);
    sun.add(coronaInner);
    const coronaOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture("rgba(255,214,150,0.35)", "rgba(255,140,50,0.14)"),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.7,
        fog: false,
      })
    );
    coronaOuter.scale.setScalar(8.5);
    sun.add(coronaOuter);
    scene.add(sun);

    const PLANET_DEFS = [
      // Scorched inner rock.
      { radius: 0.42, orbitRadius: 4.5, speed: 0.35, tilt: 0.35, axial: 0.04, bands: 2.5,
        ramp: [0x2b1a12, 0x6b3a22, 0xb06a38, 0xe0a05c], iceCap: 1.1 },
      // Rusty desert world.
      { radius: 0.34, orbitRadius: 6.4, speed: 0.26, tilt: -0.55, axial: 0.42, bands: 3,
        ramp: [0x4a1f14, 0x8c3d22, 0xc2683a, 0xe6a173], iceCap: 0.86 },
      // Earthlike: oceans, coasts, landmass, cloud deck on a separate shell.
      { radius: 0.52, orbitRadius: 8.6, speed: 0.19, tilt: 0.25, axial: 0.41, bands: 2,
        ramp: [0x0a2c52, 0x11467a, 0xc2ab72, 0x2f6b34, 0x8fa36a], iceCap: 0.8, clouds: true },
      // Banded gas giant with a ring system.
      { radius: 0.95, orbitRadius: 11.5, speed: 0.13, tilt: -0.3, axial: 0.47, bands: 9,
        ramp: [0x6b4a2a, 0xa8783f, 0xd9b071, 0xf0dcb0], iceCap: 1.1, ring: 0xd8c39a },
      // Cold ice giant on the outer edge.
      { radius: 0.6, orbitRadius: 14.5, speed: 0.09, tilt: 0.5, axial: 1.7, bands: 6,
        ramp: [0x123c5e, 0x1e6c96, 0x4aa3c4, 0x9fd6e6], iceCap: 0.9 },
    ];
    const planets = PLANET_DEFS.map((def) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius, 40, 28),
        new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 })
      );
      mesh.visible = false;
      mesh.rotation.z = def.axial;

      let ring = null;
      if (def.ring) {
        // A flat annulus (not a torus) is what actually reads as a ring plane,
        // and its UVs let the banded texture run radially.
        const ringGeo = new THREE.RingGeometry(def.radius * 1.5, def.radius * 2.6, 96, 1);
        const pos = ringGeo.attributes.position;
        const uv = ringGeo.attributes.uv;
        const v = new THREE.Vector3();
        const inner = def.radius * 1.5;
        const outer = def.radius * 2.6;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
        }
        ring = new THREE.Mesh(
          ringGeo,
          new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = Math.PI / 2;
        mesh.add(ring);
      }

      let clouds = null;
      if (def.clouds) {
        clouds = new THREE.Mesh(
          new THREE.SphereGeometry(def.radius * 1.02, 32, 20),
          new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, roughness: 1, depthWrite: false })
        );
        mesh.add(clouds);
      }

      scene.add(mesh);
      return { ...def, mesh, ring, ringColor: def.ring ?? null, clouds, angle: Math.random() * Math.PI * 2, spin: 0.25 + Math.random() * 0.4 };
    });

    /* Distant stars. They're parented to nothing and re-centred on the camera
       every frame, so they never parallax and never leave the 100-unit far
       plane — which is exactly how genuinely distant stars behave. Per-vertex
       size and colour temperature come through a tiny shader so the field has
       real magnitude variation instead of uniform dots. */
    const STAR_COUNT = isSmallScreen ? 2600 : 5200;
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starColor = new Float32Array(STAR_COUNT * 3);
    const starSize = new Float32Array(STAR_COUNT);
    const STAR_TEMPS = [
      [0.62, 0.72, 1.0], // hot blue
      [0.78, 0.85, 1.0],
      [1.0, 1.0, 1.0],
      [1.0, 0.96, 0.86],
      [1.0, 0.84, 0.62], // cool orange
      [1.0, 0.7, 0.52],
    ];
    for (let i = 0; i < STAR_COUNT; i++) {
      // Half uniform over the sphere, half concentrated into a galactic band.
      const inBand = i % 2 === 0;
      const theta = Math.random() * Math.PI * 2;
      const u = inBand
        ? Math.max(-1, Math.min(1, (Math.random() + Math.random() + Math.random() - 1.5) * 0.42))
        : Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(r * Math.cos(theta), u, r * Math.sin(theta));
      if (inBand) dir.applyAxisAngle(new THREE.Vector3(0.42, 0, 0.9).normalize(), 0.5);
      dir.multiplyScalar(70);
      starPos[i * 3] = dir.x;
      starPos[i * 3 + 1] = dir.y;
      starPos[i * 3 + 2] = dir.z;
      const temp = STAR_TEMPS[(Math.random() * STAR_TEMPS.length) | 0];
      // Magnitude distribution: mostly faint pinpricks, a few standouts.
      const mag = Math.pow(Math.random(), 2.6);
      const b = 0.55 + mag * 0.45;
      // The eye only resolves colour in the brightest stars, and the post
      // pass's chromatic aberration turns saturated 2px dots into coloured
      // confetti — so faint stars are pulled back toward white.
      const sat = 0.25 + mag * 0.75;
      starColor[i * 3] = (1 + (temp[0] - 1) * sat) * b;
      starColor[i * 3 + 1] = (1 + (temp[1] - 1) * sat) * b;
      starColor[i * 3 + 2] = (1 + (temp[2] - 1) * sat) * b;
      starSize[i] = 1.8 + mag * 3.4;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColor, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }, uTwinkle: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: `
        attribute float aSize;
        varying vec3 vColor;
        varying float vMag;
        uniform float uPixelRatio;
        uniform float uTwinkle;
        void main() {
          vColor = color;
          vMag = aSize;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float flicker = 0.85 + 0.15 * sin(uTwinkle * 2.0 + position.x * 12.0 + position.y * 7.0);
          gl_PointSize = aSize * uPixelRatio * flicker;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vMag;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          if (r > 0.5) discard;
          // Soft airy-disc core plus a faint halo on the brighter stars.
          float core = smoothstep(0.5, 0.0, r);
          float halo = smoothstep(0.5, 0.15, r) * 0.35 * smoothstep(2.0, 4.4, vMag);
          gl_FragColor = vec4(vColor, core * core + halo);
        }
      `,
    });
    starMaterial.vertexColors = true;
    const starfield = new THREE.Points(starGeo, starMaterial);
    starfield.visible = false;
    starfield.frustumCulled = false;
    scene.add(starfield);

    // A couple of huge, very dim nebula clouds for depth behind the stars.
    const nebulaTex = makeGlowTexture("rgba(120,90,200,0.5)", "rgba(60,40,120,0.22)");
    const nebulae = [
      { color: 0x7a5cc4, pos: new THREE.Vector3(-46, 14, -44), scale: 62 },
      { color: 0x2f6f8c, pos: new THREE.Vector3(52, -18, -30), scale: 50 },
      { color: 0x8c3f5a, pos: new THREE.Vector3(10, 30, 55), scale: 44 },
    ].map(({ color, pos, scale }) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: nebulaTex,
          color,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.16,
          fog: false,
        })
      );
      sprite.position.copy(pos);
      sprite.scale.setScalar(scale);
      sprite.visible = false;
      scene.add(sprite);
      return sprite;
    });

    /* Surface textures cost a few hundred thousand noise samples to generate,
       which is pure waste for the vast majority of visitors who never fly
       into the core. Built once, lazily, on the first warp. */
    let solarTexturesBuilt = false;
    function buildSolarTextures() {
      if (solarTexturesBuilt) return;
      solarTexturesBuilt = true;
      planets.forEach((p) => {
        p.mesh.material.map = makePlanetTexture(p);
        p.mesh.material.needsUpdate = true;
        if (p.ring) {
          p.ring.material.map = makeRingTexture(p.ringColor);
          p.ring.material.needsUpdate = true;
        }
        if (p.clouds) {
          const tex = makePlanetTexture({ bands: 3.5, ramp: [0x000000, 0x000000, 0xffffff, 0xffffff], iceCap: 1.1 });
          p.clouds.material.alphaMap = tex;
          p.clouds.material.transparent = true;
          p.clouds.material.needsUpdate = true;
        }
      });
    }

    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.09, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    portal.position.copy(PORTAL_POSITION);
    portal.visible = false;
    scene.add(portal);

    const warpFlash = document.createElement("div");
    warpFlash.className = "warp-flash";
    mount.appendChild(warpFlash);

    // Nearest-beacon HUD: a rotating bearing arrow + distance readout that's
    // always on while piloting, not just when close. Flying far from every
    // beacon into empty space previously left the player with zero cues
    // about which way to go back — this fixes that directly.
    const beaconLabel = document.createElement("div");
    beaconLabel.className = "beacon-label";
    beaconLabel.innerHTML = '<span class="beacon-arrow">▲</span><span class="beacon-text"></span>';
    mount.appendChild(beaconLabel);
    const beaconArrow = beaconLabel.querySelector(".beacon-arrow");
    const beaconText = beaconLabel.querySelector(".beacon-text");

    /* On-screen flight controls, shown only while piloting on a touch
       device. These go on the body, not the mount: the mount is a
       z-index:0 stacking context, so anything inside it — however high its
       own z-index — still paints and hit-tests below .content at z-index 1.
       Mounted there the buttons drew correctly but every touch landed on the
       page underneath them, so thrust silently did nothing. */
    const touchControls = document.createElement("div");
    touchControls.className = "pilot-touch";
    touchControls.style.display = "none";
    const thrustBtn = document.createElement("button");
    thrustBtn.type = "button";
    thrustBtn.className = "pilot-touch-btn pilot-touch-thrust";
    thrustBtn.textContent = "THRUST";
    thrustBtn.setAttribute("aria-label", "Hold to thrust");
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "pilot-touch-btn pilot-touch-lift";
    upBtn.textContent = "▲";
    upBtn.setAttribute("aria-label", "Hold to climb");
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "pilot-touch-btn pilot-touch-lift";
    downBtn.textContent = "▼";
    downBtn.setAttribute("aria-label", "Hold to descend");
    const liftPad = document.createElement("div");
    liftPad.className = "pilot-touch-liftpad";
    liftPad.append(upBtn, downBtn);
    touchControls.append(liftPad, thrustBtn);
    document.body.appendChild(touchControls);

    // Holding a control must not also grab the steering finger, so each
    // button swallows its own touches before they reach the window handler.
    const held = { thrust: false, up: false, down: false };
    function bindHold(el, key) {
      const press = (e) => {
        e.preventDefault();
        e.stopPropagation();
        held[key] = true;
      };
      const release = (e) => {
        e.stopPropagation();
        held[key] = false;
      };
      el.addEventListener("touchstart", press, { passive: false });
      el.addEventListener("touchend", release, { passive: true });
      el.addEventListener("touchcancel", release, { passive: true });
      // Mouse fallback so the controls are testable and usable with a cursor.
      el.addEventListener("mousedown", press);
      el.addEventListener("mouseup", release);
      el.addEventListener("mouseleave", release);
    }
    bindHold(thrustBtn, "thrust");
    bindHold(upBtn, "up");
    bindHold(downBtn, "down");

    function onScroll() {
      const currentY = window.scrollY;
      scrollVelocity.current = currentY - lastScrollY.current;
      lastScrollY.current = currentY;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    function onResize() {
      width = mount.clientWidth;
      height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      cssRenderer.setSize(width, height);
      renderTarget.setSize(width, height);
      postMaterial.uniforms.uResolution.value.set(width, height);
    }
    window.addEventListener("resize", onResize);

    let raf;
    let lastT = 0;
    const clock = new THREE.Clock();

    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const scroll = scrollRef.current || 0;
      const motion = reducedMotion ? 0.15 : 1;

      // Update raycaster for interactions
      raycaster.setFromCamera(pointer, camera);

      // Check for hover on blob
      const blobIntersects = raycaster.intersectObject(blob);
      const isBlobHovered = blobIntersects.length > 0;

      const targetBlobScale = isBlobHovered ? 1.15 : 1.0;

      // Real GitHub activity subtly speeds up the blob's idle rotation —
      // it's meant to look more restless when there's been recent commit activity.
      const activityBoost = 1 + (activityRef.current || 0) * 0.4;
      const blobTargetSpeed = (isBlobHovered ? 0.25 : 0.06) * activityBoost;
      blob.userData.currentSpeed = blob.userData.currentSpeed || 0.06;
      blob.userData.currentSpeed += (blobTargetSpeed - blob.userData.currentSpeed) * 0.05;

      scrollVelocity.current *= 0.9;
      const velocityDistort = Math.min(Math.abs(scrollVelocity.current) * 0.003, 0.4);
      const currentBlobScale = targetBlobScale + velocityDistort;

      blob.scale.lerp(new THREE.Vector3(currentBlobScale, currentBlobScale, currentBlobScale), 0.08);

      blob.rotation.y = t * blob.userData.currentSpeed * motion + scroll * Math.PI * 1.4;
      blob.rotation.x = t * (blob.userData.currentSpeed * 0.5) * motion + scroll * 0.6;

      if (isBlobHovered && !reducedMotion) {
        blobMat.opacity = THREE.MathUtils.lerp(blobMat.opacity, 0.6, 0.1);
      } else {
        blobMat.opacity = THREE.MathUtils.lerp(blobMat.opacity, 0.32, 0.1);
      }

      strokes.forEach((s) => {
        s.rotation.x = t * s.userData.speed * motion;
        s.rotation.y = t * s.userData.speed * 0.7 * motion;

        if (!reducedMotion) {
          const intersects = raycaster.intersectObject(s);
          if (intersects.length > 0) {
            s.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), 0.1);
            s.material.opacity = THREE.MathUtils.lerp(s.material.opacity, 0.9, 0.1);
          } else {
            s.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.1);
            s.material.opacity = THREE.MathUtils.lerp(s.material.opacity, s.userData.originalOpacity || 0.4, 0.05);
          }
        }
      });

      particles.rotation.y = t * 0.012 * motion;

      // Compute world mouse position for interactions
      let mousePos;
      if (!reducedMotion) {
          const vector = new THREE.Vector3(pointer.x, pointer.y, 0.5);
          vector.unproject(camera);
          const dir = vector.sub(camera.position).normalize();
          const distance = (0 - camera.position.z) / dir.z; 
          mousePos = camera.position.clone().add(dir.multiplyScalar(distance));
          
          // Update cursor trail
          if (trailDots[0].position.z === -100) {
              trailDots.forEach(d => d.position.copy(mousePos));
          } else {
              trailDots[0].position.copy(mousePos);
              for (let i = 1; i < trailCount; i++) {
                 trailDots[i].position.lerp(trailDots[i-1].position, 0.45);
              }
          }
      }

      // Compute shockwave position outside the loop
      let shockwavePos = null;
      if (!reducedMotion && shockwaveRef.current.active) {
          const vector = new THREE.Vector3(shockwaveRef.current.x, shockwaveRef.current.y, 0.5);
          vector.unproject(camera);
          const dir = vector.sub(camera.position).normalize();
          const distance = (0 - camera.position.z) / dir.z; 
          shockwavePos = camera.position.clone().add(dir.multiplyScalar(distance));
          world.worldToLocal(shockwavePos);
          
          shockwaveRef.current.time += 0.02; 
          if (shockwaveRef.current.time > 1.0) shockwaveRef.current.active = false; 
      }

      // --- N-body gravity step ---
      // Real inverse-square gravity, integrated with an actual velocity each
      // frame: the blob and the pointer are gravity wells, every particle
      // also pulls on every other particle (full O(n^2), no shortcuts), and
      // a shockwave click is a brief repulsive kick on top of all that.
      const dt = Math.min(Math.max(t - lastT, 0), 0.05) * motion;
      lastT = t;

      if (dt > 0) {
        const particlePositions = particles.geometry.attributes.position.array;

        let pointerWorld = null;
        if (!reducedMotion && mousePos) {
          pointerWorld = mousePos.clone();
          world.worldToLocal(pointerWorld);
        }

        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3;
          const iy = i * 3 + 1;
          const iz = i * 3 + 2;
          const px = particlePositions[ix];
          const py = particlePositions[iy];
          const pz = particlePositions[iz];

          // Gravity toward the blob, sitting at the origin.
          const rx = -px, ry = -py, rz = -pz;
          const rSq = rx * rx + ry * ry + rz * rz + GRAV_SOFTEN * GRAV_SOFTEN;
          const invR = 1 / Math.sqrt(rSq);
          const blobForce = GRAV_BLOB * invR * invR * invR;
          let ax = rx * blobForce;
          let ay = ry * blobForce;
          let az = rz * blobForce;

          // The pointer is a second, movable gravity well.
          if (pointerWorld) {
            const dx = pointerWorld.x - px;
            const dy = pointerWorld.y - py;
            const dz = pointerWorld.z - pz;
            const dSq = dx * dx + dy * dy + dz * dz + GRAV_SOFTEN * GRAV_SOFTEN;
            const invD = 1 / Math.sqrt(dSq);
            const pointerForce = GRAV_POINTER * invD * invD * invD;
            ax += dx * pointerForce;
            ay += dy * pointerForce;
            az += dz * pointerForce;
          }

          // A shockwave click is a sharp transient kick, not gravity.
          if (shockwavePos) {
            const sdx = px - shockwavePos.x;
            const sdy = py - shockwavePos.y;
            const sdz = pz - shockwavePos.z;
            const sdist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
            const swRadius = shockwaveRef.current.time * 30.0;
            const swThickness = 3.0;
            if (sdist > 0 && Math.abs(sdist - swRadius) < swThickness) {
              const sforce = (1 - Math.abs(sdist - swRadius) / swThickness) * 10.0;
              ax += (sdx / sdist) * sforce;
              ay += (sdy / sdist) * sforce;
              az += (sdz / sdist) * sforce;
            }
          }

          velocities[ix] += ax * dt;
          velocities[iy] += ay * dt;
          velocities[iz] += az * dt;
        }

        // Mutual particle-particle gravity: every pair, every frame.
        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
          for (let j = i + 1; j < particleCount; j++) {
            const jx = j * 3, jy = j * 3 + 1, jz = j * 3 + 2;
            const dx = particlePositions[jx] - particlePositions[ix];
            const dy = particlePositions[jy] - particlePositions[iy];
            const dz = particlePositions[jz] - particlePositions[iz];
            const dSq = dx * dx + dy * dy + dz * dz + GRAV_SOFTEN * GRAV_SOFTEN;
            const invD = 1 / Math.sqrt(dSq);
            const f = GRAV_MUTUAL * invD * invD * invD * dt;
            const fx = dx * f, fy = dy * f, fz = dz * f;
            velocities[ix] += fx;
            velocities[iy] += fy;
            velocities[iz] += fz;
            velocities[jx] -= fx;
            velocities[jy] -= fy;
            velocities[jz] -= fz;
          }
        }

        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;

          // Very light damping — just enough that the discrete integration
          // (plus shockwave kicks) can't pump energy in forever, without
          // decaying real orbits into a collapsed clump within a minute.
          velocities[ix] *= 0.9998;
          velocities[iy] *= 0.9998;
          velocities[iz] *= 0.9998;

          particlePositions[ix] += velocities[ix] * dt;
          particlePositions[iy] += velocities[iy] * dt;
          particlePositions[iz] += velocities[iz] * dt;

          // Soft containment: a chaotic N-body system can otherwise drift
          // out of frame, or a close pass can fling a particle to infinity.
          const r = Math.sqrt(
            particlePositions[ix] * particlePositions[ix] +
              particlePositions[iy] * particlePositions[iy] +
              particlePositions[iz] * particlePositions[iz]
          );
          if (r > 16) {
            const pull = (r - 16) * 0.02;
            particlePositions[ix] -= (particlePositions[ix] / r) * pull;
            particlePositions[iy] -= (particlePositions[iy] / r) * pull;
            particlePositions[iz] -= (particlePositions[iz] / r) * pull;
          } else if (r < 0.5 && r > 0.0001) {
            const push = (0.5 - r) * 0.05;
            particlePositions[ix] += (particlePositions[ix] / r) * push;
            particlePositions[iy] += (particlePositions[iy] / r) * push;
            particlePositions[iz] += (particlePositions[iz] / r) * push;
          }
        }

        particles.geometry.attributes.position.needsUpdate = true;
      }

      const piloting = pilotModeRef.current;

      const wantTouchUI = piloting && isTouchDevice;
      if (touchControls.dataset.on !== String(wantTouchUI)) {
        touchControls.dataset.on = String(wantTouchUI);
        touchControls.style.display = wantTouchUI ? "flex" : "none";
      }

      if (piloting) {
        if (!wasPiloting) {
          // Just entered pilot mode — take off from wherever the scroll
          // camera currently is, instead of snapping somewhere arbitrary.
          ship.pos.copy(camera.position);
          ship.vel.set(0, 0, 0);
          ship.yaw = camera.rotation.y;
          ship.pitch = camera.rotation.x;
          camera.rotation.z = 0;
          hasThrustedSinceEntry = false;

          // Not a page hanging in space, and not even whole words — every
          // single character is its own bare fragment, entirely detached
          // from the DOM it came from beyond borrowing its font and color.
          if (contentRef?.current) {
            const FRAGMENT_SELECTOR =
              "h1, h2, h3, p, li, .eyebrow, .section-num, .display, " +
              ".project-tagline, .tag, .skill-chip, .strip-label, " +
              ".now-tag, .open-to, .k, .v";
            let fragments = Array.from(contentRef.current.querySelectorAll(FRAGMENT_SELECTOR));
            // Drop anything nested inside another match (e.g. a heading
            // inside a matched paragraph's ancestor) so text isn't doubled.
            fragments = fragments.filter(
              (el, _, arr) => !arr.some((other) => other !== el && other.contains(el))
            );
            fragments = fragments.filter((el) => el.textContent.trim().length > 0);
            // Only what's actually on screen right now — anything below the
            // fold has no real on-screen rect to start from, and clamping
            // all of it to the frame edge piled dozens of unrelated
            // fragments on top of each other in an unreadable heap. This
            // way "float where it is" only ever means somewhere the pilot
            // was just looking, which is also what keeps the whole wall
            // readably in front of the ship instead of smeared to one side.
            fragments = fragments.filter((el) => {
              const r = el.getBoundingClientRect();
              return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
            }).slice(0, 70);

            // Each fragment element is broken down into its individual
            // characters — not linked to the page at all beyond borrowing
            // its font/color and its exact on-screen position a moment ago.
            // Measured before the real DOM is hidden (opacity doesn't
            // affect layout, but the Range rects need the text still
            // actually laid out to measure against).
            const MAX_CHAR_FRAGMENTS = 220;
            const charFragments = [];
            charScan: for (const el of fragments) {
              const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
              let textNode;
              while ((textNode = walker.nextNode())) {
                const style = getComputedStyle(textNode.parentElement);
                const text = textNode.textContent;
                for (let i = 0; i < text.length; i++) {
                  const ch = text[i];
                  if (!ch.trim()) continue;
                  const range = document.createRange();
                  range.setStart(textNode, i);
                  range.setEnd(textNode, i + 1);
                  const rect = range.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0) continue;
                  charFragments.push({ ch, rect, style });
                  if (charFragments.length >= MAX_CHAR_FRAGMENTS) break charScan;
                }
              }
            }

            contentRef.current.style.opacity = "0";
            contentRef.current.style.pointerEvents = "none";

            contentPanels.forEach((p) => contentGroup.remove(p));
            contentPanels = [];

            const forward = new THREE.Vector3(0, 0, -1).applyEuler(
              new THREE.Euler(ship.pitch, ship.yaw, 0, "YXZ")
            );
            contentGroup.position.copy(ship.pos).addScaledVector(forward, 26);
            contentGroup.rotation.set(0, 0, 0);
            contentGroup.updateMatrixWorld(true);

            // Where each character starts: unproject its on-screen rect back
            // into world space, the same spot it visually occupied a moment
            // ago — exact, since every fragment here is already confirmed
            // on screen (see the viewport filter above).
            const LIFTOFF_DIST = 13;
            function screenToLocalStart(rect) {
              const ndcX = THREE.MathUtils.clamp(
                ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1,
                -1, 1
              );
              const ndcY = THREE.MathUtils.clamp(
                -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1,
                -1, 1
              );
              const vec = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera);
              const dir = vec.sub(camera.position).normalize();
              const world = camera.position.clone().addScaledVector(dir, LIFTOFF_DIST);
              return contentGroup.worldToLocal(world);
            }

            const FRAGMENT_SCALE = 0.017;
            charFragments.forEach(({ ch, rect, style }) => {
              const span = document.createElement("span");
              span.textContent = ch;
              span.style.display = "inline-block";
              span.style.whiteSpace = "pre";
              span.style.fontFamily = style.fontFamily;
              span.style.fontSize = style.fontSize;
              span.style.fontWeight = style.fontWeight;
              span.style.fontStyle = style.fontStyle;
              span.style.letterSpacing = style.letterSpacing;
              span.style.color = style.color;
              span.style.pointerEvents = "none";
              span.style.textShadow = "0 0 14px rgba(11,11,10,0.9)";
              span.style.opacity = "0.94";
              span.style.backfaceVisibility = "hidden";
              span.style.webkitBackfaceVisibility = "hidden";

              const frag = new CSS3DObject(span);
              frag.scale.setScalar(FRAGMENT_SCALE);

              frag.position.copy(screenToLocalStart(rect));
              frag.quaternion.copy(camera.quaternion);

              frag.userData.velocity = new THREE.Vector3(0, 0, 0);
              frag.userData.spin = new THREE.Vector3(
                (Math.random() - 0.5) * 0.16,
                (Math.random() - 0.5) * 0.16,
                (Math.random() - 0.5) * 0.16
              );
              contentGroup.add(frag);
              contentPanels.push(frag);
            });
          }
        }

        if (document.pointerLockElement || touchMode) {
          // Standard FPS-style mouse-look: only movement matters, there's
          // no "correct" place to park the cursor. This is the actual fix
          // for "the controls are hard" — the old scheme required holding
          // the mouse at the exact center of the screen to fly straight.
          ship.yaw -= mouseDelta.x * MOUSE_SENSITIVITY;
          ship.pitch = THREE.MathUtils.clamp(ship.pitch - mouseDelta.y * MOUSE_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
          // Only clear the buffer once it's actually been applied — there's
          // an inherent one-frame gap between requesting pointer lock and it
          // engaging, and clearing unconditionally on every frame (including
          // frames that took the fallback branch below) silently threw away
          // real accumulated mouse input during that gap.
          mouseDelta.x = 0;
          mouseDelta.y = 0;
        } else {
          // Fallback if pointer lock is unavailable/denied: the older
          // position-relative-to-center scheme, worse but functional.
          ship.yaw -= pointer.x * STEER_RATE * dt;
          ship.pitch = THREE.MathUtils.clamp(ship.pitch + pointer.y * STEER_RATE * 0.65 * dt, -PITCH_LIMIT, PITCH_LIMIT);
        }

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(ship.pitch, ship.yaw, 0, "YXZ"));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, ship.yaw, 0, "YXZ"));
        const up = new THREE.Vector3(0, 1, 0);

        const thrust = new THREE.Vector3();
        if (keys.KeyW || keys.ArrowUp) thrust.add(forward);
        if (keys.KeyS || keys.ArrowDown) thrust.sub(forward);
        if (keys.KeyD || keys.ArrowRight) thrust.add(right);
        if (keys.KeyA || keys.ArrowLeft) thrust.sub(right);
        if (keys.Space || held.up) thrust.add(up);
        if (keys.ShiftLeft || keys.ShiftRight || held.down) thrust.sub(up);
        if (held.thrust) thrust.add(forward);
        if (thrust.lengthSq() > 0) {
          hasThrustedSinceEntry = true;
          thrust.normalize().multiplyScalar(SHIP_ACCEL * dt);
        }

        /* Gravity around the core, in two tiers.

           Outside the horizon it's an ordinary escapable pull (CAPTURE_ACCEL
           is below SHIP_ACCEL, so full thrust wins). That alone can't set up
           the dive though: an unpowered flyby is a hyperbola, so whatever
           speed gravity adds on the way in it takes straight back on the way
           out, and the ship sails through the trigger sphere in a few tenths
           of a second when the dive needs to be held for about a second.

           So crossing the horizon commits you. Thrust is cut to a token
           amount, the pull goes hard, and drag collapses your speed — the
           ship falls to the middle and the dive completes. A one-way trip
           past the horizon is what a black hole actually is, and it's the
           only version of this that's reliably reachable by flying. */
        const distToCore = ship.pos.length();
        const gravityArmed = hasThrustedSinceEntry;
        if (gravityArmed && !inSolarSystem && distToCore < BLACKHOLE_TRIGGER_RADIUS) captured = true;

        if (captured) {
          ship.vel.addScaledVector(thrust, 0.12);
          if (distToCore > 0.0001) {
            ship.vel.addScaledVector(ship.pos, (-CAPTURE_ACCEL * 1.6 * dt) / distToCore);
          }
          ship.vel.multiplyScalar(Math.pow(0.02, dt));
        } else {
          ship.vel.add(thrust);
          if (gravityArmed && !inSolarSystem && distToCore < CAPTURE_RADIUS && distToCore > 0.0001) {
            const pull = 1 - distToCore / CAPTURE_RADIUS;
            ship.vel.addScaledVector(ship.pos, (-CAPTURE_ACCEL * pull * dt) / distToCore);
          }
        }

        ship.vel.multiplyScalar(Math.pow(SHIP_DRAG_PER_SEC, dt));
        if (ship.vel.length() > SHIP_MAX_SPEED) ship.vel.setLength(SHIP_MAX_SPEED);
        ship.pos.addScaledVector(ship.vel, dt);

        // --- black hole dive / solar system ---
        if (!inSolarSystem) {
          const distToCore = ship.pos.length(); // the blob sits at the origin
          diveProgress =
            gravityArmed && distToCore < BLACKHOLE_TRIGGER_RADIUS
              ? Math.min(1, diveProgress + dt * DIVE_RATE)
              : Math.max(0, diveProgress - dt * DIVE_RATE * 1.5); // a light brush recovers rather than committing you

          if (diveProgress >= 1) {
            inSolarSystem = true;
            diveProgress = 0;
            captured = false;
            flashOpacity = 1;
            buildSolarTextures();
            blob.visible = false;
            strokes.forEach((s) => (s.visible = false));
            particles.visible = false;
            // The cursor trail dots park at the origin, which is exactly
            // where the sun sits — they'd read as a dark blot on its face.
            trailDots.forEach((d) => (d.visible = false));
            contentPanels.forEach((p) => (p.visible = false));
            beacons.forEach((b) => (b.group.visible = false));
            secretBeacon.visible = false;
            sun.visible = true;
            sunLight.visible = true;
            starFill.visible = true;
            starfield.visible = true;
            nebulae.forEach((n) => (n.visible = true));
            planets.forEach((p) => (p.mesh.visible = true));
            portal.visible = true;
            ship.pos.copy(SOLAR_SYSTEM_ARRIVAL);
            ship.vel.set(0, 0, 0);
            ship.yaw = 0;
            ship.pitch = -0.12;
            // Snap the lensing off rather than letting it ease out. It's
            // centred on the origin, which is exactly where the sun now sits,
            // so a slow decay spends several seconds smearing the star into
            // an oval with a dark pinch through its middle.
            postMaterial.uniforms.uLensStrength.value = 0;
            // Space is very nearly a vacuum — almost no fog, so the distant
            // starfield actually reads instead of being washed out.
            scene.fog.color.setHex(0x05060d);
            scene.fog.density = 0.006;
          }
        } else {
          planets.forEach((p) => {
            p.angle += dt * p.speed;
            // Each orbit sits on its own slightly inclined plane, so the
            // system looks like a real one rather than a flat dial.
            p.mesh.position.set(
              Math.cos(p.angle) * p.orbitRadius,
              Math.sin(p.angle) * p.tilt,
              Math.sin(p.angle) * p.orbitRadius
            );
            // Rings stay locked to the planet's equator; only the body spins.
            p.mesh.rotation.y += dt * p.spin;
            // Clouds drift slightly faster than the surface beneath them.
            if (p.clouds) p.clouds.rotation.y += dt * 0.06;
          });
          sun.rotation.y += dt * 0.05;
          portal.rotation.y += dt * 0.9;
          starMaterial.uniforms.uTwinkle.value = t;

          if (ship.pos.distanceTo(portal.position) < PORTAL_RADIUS) {
            inSolarSystem = false;
            captured = false;
            flashOpacity = 1;
            sun.visible = false;
            sunLight.visible = false;
            starFill.visible = false;
            starfield.visible = false;
            nebulae.forEach((n) => (n.visible = false));
            planets.forEach((p) => (p.mesh.visible = false));
            portal.visible = false;
            blob.visible = true;
            strokes.forEach((s) => (s.visible = true));
            particles.visible = true;
            trailDots.forEach((d) => (d.visible = true));
            contentPanels.forEach((p) => (p.visible = true));
            ship.pos.set(0, 0, 6);
            ship.vel.set(0, 0, 0);
            ship.yaw = 0;
            ship.pitch = 0;
            scene.fog.color.setHex(0x0b0b0a);
            scene.fog.density = 0.05;
          }
        }
        // Genuinely distant stars show no parallax, so the field rides along
        // with the camera and stays comfortably inside the far plane.
        starfield.position.copy(camera.position);
        flashOpacity = damp(flashOpacity, 0, 3, dt);
        warpFlash.style.opacity = String(flashOpacity);

        // Position the visible ship and light its engines based on thrust.
        shipGroup.visible = true;
        shipGroup.position.copy(ship.pos);
        shipGroup.rotation.set(ship.pitch, ship.yaw, 0, "YXZ");

        // The secret marker: a slow twinkle, no HUD entry, no compass arrow.
        // Only relevant in the normal area — hidden entirely inside the
        // solar system, where it has no meaning.
        if (!inSolarSystem) {
          secretBeacon.visible = true;
          secretBeacon.material.opacity = 0.22 + Math.sin(t * 1.3) * 0.12;
          secretBeacon.rotation.y += dt * 0.3;
          if (!secretDocked && ship.pos.distanceTo(secretBeacon.position) < SECRET_DOCK_RADIUS) {
            secretDocked = true;
            onSecretFound?.();
          }
        }

        const throttleTarget = thrust.lengthSq() > 0 ? 1 : 0.15;
        ship.throttle = damp(ship.throttle, throttleTarget, 9, dt);
        const flicker = 0.85 + Math.sin(t * 45) * 0.08 + Math.sin(t * 13) * 0.05;
        const flameStretch = (0.5 + ship.throttle * 1.6) * flicker;
        engines.forEach(({ flameInner, flameOuter }) => {
          flameInner.scale.z = 0.85 * flameStretch;
          flameOuter.scale.z = 1.15 * flameStretch;
          flameInner.material.opacity = 0.4 + ship.throttle * 0.55;
          flameOuter.material.opacity = (0.25 + ship.throttle * 0.4) * flicker;
        });

        // Speed is felt, not just measured: widen the FOV slightly as the
        // ship accelerates, the classic racing-game trick for conveying
        // velocity without any HUD numbers. Diving toward the core pushes
        // it much further, selling the "falling in" sensation.
        const speedFrac = ship.vel.length() / SHIP_MAX_SPEED;
        camera.fov = damp(camera.fov, 55 + speedFrac * 10 + diveProgress * 25, 6, dt);
        camera.updateProjectionMatrix();

        // Third-person chase camera: trails behind and slightly above,
        // banking with the ship instead of snapping rigidly to it. Damped
        // (frame-rate independent) rather than a fixed-factor lerp, so it
        // settles at the same rate on a 60Hz or a 144Hz display.
        const chaseOffset = new THREE.Vector3(0, 0.55, 2.2).applyEuler(
          new THREE.Euler(ship.pitch * 0.4, ship.yaw, 0, "YXZ")
        );
        dampVec3(camera.position, ship.pos.clone().add(chaseOffset), 6, dt);
        camera.up.set(0, 1, 0);
        camera.lookAt(ship.pos.clone().addScaledVector(forward, 2.5));

        // Navigation beacons — fly close enough to one and it docks you
        // straight into that section, exiting pilot mode automatically.
        // Meaningless inside the solar system, so skipped entirely there.
        if (!inSolarSystem) {
          let nearestLabel = null;
          let nearestDist = Infinity;
          let nearestBeaconPos = null;
          beacons.forEach((b) => {
            b.group.visible = true;
            b.group.rotation.y += dt * 0.6;
            b.ring.rotation.x += dt * 0.5;
            const dist = ship.pos.distanceTo(b.group.position);
            const near = dist < 3.2;
            b.group.scale.setScalar(near ? 1.35 : 1);
            b.ring.material.opacity = near ? 1 : 0.75;
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestLabel = b.label;
              nearestBeaconPos = b.group.position;
            }
            // Beacons are solid, not a teleport trigger: getting close
            // bounces the ship off rather than jumping to that section.
            if (dist < DOCK_RADIUS && dist > 0.0001) {
              const pushDir = ship.pos.clone().sub(b.group.position).normalize();
              const overlap = 1 - dist / DOCK_RADIUS;
              ship.vel.addScaledVector(pushDir, overlap * BEACON_BOUNCE_FORCE * dt);
              ship.pos.addScaledVector(pushDir, overlap * DOCK_RADIUS * 0.6 * dt);
            }
          });
          if (nearestLabel && nearestBeaconPos) {
            beaconText.textContent = `${nearestLabel.toUpperCase()} — ${nearestDist.toFixed(1)}u`;
            // Bearing to the beacon relative to the ship's own facing — 0 is
            // straight ahead, so the arrow always points the true way to turn.
            const toBeacon = nearestBeaconPos.clone().sub(ship.pos);
            const cos = Math.cos(-ship.yaw);
            const sin = Math.sin(-ship.yaw);
            const localX = toBeacon.x * cos - toBeacon.z * sin;
            const localZ = toBeacon.x * sin + toBeacon.z * cos;
            const bearing = Math.atan2(localX, -localZ);
            beaconArrow.style.transform = `rotate(${bearing}rad)`;
            beaconLabel.style.opacity = "1";
          } else {
            beaconLabel.style.opacity = "0";
          }

          // Ship collision physics — a tight radius so individual
          // characters bump out of the way on their own instead of a whole
          // sentence flinching together.
          const COLLISION_RADIUS = 1.1;
          const REPULSION_FORCE = 18.0;
          const localShipPos = contentGroup.worldToLocal(ship.pos.clone());

          contentPanels.forEach((p) => {
            const u = p.userData;
            
            // Check collision with ship
            const dist = p.position.distanceTo(localShipPos);
            if (dist < COLLISION_RADIUS) {
              const pushDir = p.position.clone().sub(localShipPos).normalize();
              const force = (1 - dist / COLLISION_RADIUS) * REPULSION_FORCE * dt;
              u.velocity.add(pushDir.multiplyScalar(force));
              
              // Add a bit of chaotic spin when hit
              u.spin.x += (Math.random() - 0.5) * force * 0.5;
              u.spin.y += (Math.random() - 0.5) * force * 0.5;
              u.spin.z += (Math.random() - 0.5) * force * 0.5;
            }

            // Apply velocity and drag
            p.position.addScaledVector(u.velocity, dt);
            dampVec3(u.velocity, new THREE.Vector3(0, 0, 0), 2.0, dt);
            
            // Apply spin drag
            u.spin.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-0.5 * dt));

            p.rotateX(u.spin.x * dt);
            p.rotateY(u.spin.y * dt);
            p.rotateZ(u.spin.z * dt);
          });
        } else {
          beaconLabel.style.opacity = "0";
        }
      } else {
        shipGroup.visible = false;
        // A finger still down when pilot mode ends would otherwise leave the
        // ship under permanent thrust the next time it starts.
        held.thrust = false;
        held.up = false;
        held.down = false;
        steerTouch.id = null;
        beacons.forEach((b) => (b.group.visible = false));
        beaconLabel.style.opacity = "0";
        secretBeacon.visible = false;
        secretDocked = false;
        warpFlash.style.opacity = "0";

        // Hand the page back: drop the flown-through panels and reveal the
        // real DOM again, wherever the user left off scrolling.
        if (wasPiloting && contentRef?.current) {
          contentRef.current.style.opacity = "1";
          contentRef.current.style.pointerEvents = "";
          contentPanels.forEach((p) => contentGroup.remove(p));
          contentPanels = [];
        }

        // Exiting mid-warp (Escape while inside the solar system) should
        // never leave the normal scene permanently hidden behind it.
        blob.visible = true;
        strokes.forEach((s) => (s.visible = true));
        particles.visible = true;
        trailDots.forEach((d) => (d.visible = true));
        sun.visible = false;
        sunLight.visible = false;
        starFill.visible = false;
        starfield.visible = false;
        nebulae.forEach((n) => (n.visible = false));
        planets.forEach((p) => (p.mesh.visible = false));
        portal.visible = false;
        if (inSolarSystem) {
          inSolarSystem = false;
          scene.fog.color.setHex(0x0b0b0a);
          scene.fog.density = 0.05;
        }
        diveProgress = 0;
        captured = false;

        if (Math.abs(camera.fov - 55) > 0.01) {
          camera.fov = damp(camera.fov, 55, 6, dt);
          camera.updateProjectionMatrix();
        }

        world.rotation.y += (pointer.x * 0.15 - world.rotation.y) * 0.02;
        world.rotation.x += (pointer.y * 0.1 - world.rotation.x) * 0.02;

        const camPoint = cameraCurve.getPointAt(Math.min(Math.max(scroll, 0), 1));
        camera.position.copy(camPoint);
        camera.rotation.set(0, 0, Math.sin(scroll * Math.PI) * 0.035 * motion, "YXZ");
      }
      wasPiloting = piloting;

      // The lensing effect tracks the blob's actual screen position — a real
      // black hole doesn't lens light around some fixed point in the frame.
      const blobScreenPos = blob.getWorldPosition(new THREE.Vector3()).project(camera);
      postMaterial.uniforms.uLensCenter.value.set(blobScreenPos.x * 0.5 + 0.5, blobScreenPos.y * 0.5 + 0.5);
      // Escalates hard while diving toward the core (a real black hole's
      // lensing intensifies right up to the event horizon), and switches
      // off entirely once actually inside the solar system, where it's
      // the sun/planets on screen, not the blob.
      const targetLensStrength = inSolarSystem
        ? 0
        : 0.006 + (isBlobHovered ? 0.014 : 0) + Math.min(Math.abs(scrollVelocity.current) * 0.0008, 0.008) + diveProgress * 0.5;
      postMaterial.uniforms.uLensStrength.value = THREE.MathUtils.lerp(
        postMaterial.uniforms.uLensStrength.value,
        targetLensStrength,
        0.05
      );

      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      postMaterial.uniforms.uTime.value = t;
      renderer.render(postScene, postCamera);
      cssRenderer.render(cssScene, camera);
    }
      animate();

      cleanup = () => {
        cancelAnimationFrame(raf);
        if (triggerRef) triggerRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("click", onClick);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("touchstart", onTouchStart);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
        window.removeEventListener("touchcancel", onTouchEnd);
        touchControls.remove();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
        if (cssRenderer.domElement.parentNode === mount) {
          mount.removeChild(cssRenderer.domElement);
        }
        contentPanels.forEach((p) => contentGroup.remove(p));
        if (contentRef?.current) {
          contentRef.current.style.opacity = "";
          contentRef.current.style.pointerEvents = "";
        }
        if (beaconLabel.parentNode === mount) {
          mount.removeChild(beaconLabel);
        }
        if (warpFlash.parentNode === mount) {
          mount.removeChild(warpFlash);
        }
        blobGeo.dispose();
        blobMat.dispose();
        strokes.forEach((s) => {
          s.geometry.dispose();
          s.material.dispose();
        });
        particleGeo.dispose();
        particleMat.dispose();
        trailDots.forEach((d) => {
          d.geometry.dispose();
          d.material.dispose();
        });
        bodyGeo.dispose();
        cockpitGeo.dispose();
        cockpit.material.dispose();
        wingGeo.dispose();
        nozzleGeo.dispose();
        flameGeo.dispose();
        hullMat.dispose();
        trimMat.dispose();
        engines.forEach(({ flameInner, flameOuter }) => {
          flameInner.material.dispose();
          flameOuter.material.dispose();
        });
        beacons.forEach((b) => {
          b.ring.geometry.dispose();
          b.ring.material.dispose();
          b.core.geometry.dispose();
          b.core.material.dispose();
        });
        secretBeacon.geometry.dispose();
        secretBeacon.material.dispose();
        sun.children.forEach((m) => {
          // Sprites share one static geometry — disposing it would break any
          // other sprite in the scene, so only meshes get theirs disposed.
          if (m.isMesh) m.geometry.dispose();
          m.material.map?.dispose();
          m.material.dispose();
        });
        planets.forEach((p) => {
          p.mesh.geometry.dispose();
          p.mesh.material.map?.dispose();
          p.mesh.material.dispose();
          if (p.ring) {
            p.ring.geometry.dispose();
            p.ring.material.map?.dispose();
            p.ring.material.dispose();
          }
          if (p.clouds) {
            p.clouds.geometry.dispose();
            p.clouds.material.alphaMap?.dispose();
            p.clouds.material.dispose();
          }
        });
        starGeo.dispose();
        starMaterial.dispose();
        nebulae.forEach((n) => n.material.dispose());
        nebulaTex.dispose();
        portal.geometry.dispose();
        portal.material.dispose();
        renderTarget.dispose();
        postMaterial.dispose();
        postQuad.geometry.dispose();
        renderer.dispose();
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="three-mount" />;
}
