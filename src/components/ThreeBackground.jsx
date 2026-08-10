import React, { useEffect, useRef } from "react";
import { NAV_LINKS } from "../data/projects";

const PAPER = 0xf4f1e8;
const RUST = 0x7a2b22;

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

export default function ThreeBackground({ scrollRef, reducedMotion, onUnavailable, activity, triggerRef, pilotMode, onDock }) {
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

    import("three").then((THREE) => {
      if (cancelled) return;

      let width = mount.clientWidth;
      let height = mount.clientHeight;

      const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0b0a, 0.05);

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
    // gravity — no Barnes-Hut, no spatial partitioning, on purpose. 260
    // particles is ~34k pairs/frame, which a modern JS engine chews through
    // without a second thought.
    const GRAV_BLOB = 5.5;
    const GRAV_MUTUAL = 0.15;
    const GRAV_POINTER = 3.5;
    const GRAV_SOFTEN = 1.1; // avoids the classic N-body singularity at r -> 0

    const particleCount = 260;
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
    function onPointerMove(e) {
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
    const SHIP_DRAG = 0.985;
    const ship = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, throttle: 0 };
    let wasPiloting = false;
    camera.rotation.order = "YXZ";

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
    // Flying close enough "docks" — exits pilot mode and jumps you there.
    // This is the actual point of pilot mode, not just a flight-sim toy.
    const DOCK_RADIUS = 1.0;
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

    const beaconLabel = document.createElement("div");
    beaconLabel.className = "beacon-label";
    mount.appendChild(beaconLabel);

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

      if (piloting) {
        if (!wasPiloting) {
          // Just entered pilot mode — take off from wherever the scroll
          // camera currently is, instead of snapping somewhere arbitrary.
          ship.pos.copy(camera.position);
          ship.vel.set(0, 0, 0);
          ship.yaw = camera.rotation.y;
          ship.pitch = camera.rotation.x;
          camera.rotation.z = 0;
        }

        ship.yaw -= pointer.x * 0.045;
        ship.pitch = THREE.MathUtils.clamp(ship.pitch + pointer.y * 0.03, -1.3, 1.3);

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(ship.pitch, ship.yaw, 0, "YXZ"));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, ship.yaw, 0, "YXZ"));
        const up = new THREE.Vector3(0, 1, 0);

        const thrust = new THREE.Vector3();
        if (keys.KeyW || keys.ArrowUp) thrust.add(forward);
        if (keys.KeyS || keys.ArrowDown) thrust.sub(forward);
        if (keys.KeyD || keys.ArrowRight) thrust.add(right);
        if (keys.KeyA || keys.ArrowLeft) thrust.sub(right);
        if (keys.Space) thrust.add(up);
        if (keys.ShiftLeft || keys.ShiftRight) thrust.sub(up);
        if (thrust.lengthSq() > 0) thrust.normalize().multiplyScalar(SHIP_ACCEL * dt);

        ship.vel.add(thrust);
        ship.vel.multiplyScalar(SHIP_DRAG);
        if (ship.vel.length() > SHIP_MAX_SPEED) ship.vel.setLength(SHIP_MAX_SPEED);
        ship.pos.addScaledVector(ship.vel, dt);

        // Position the visible ship and light its engines based on thrust.
        shipGroup.visible = true;
        shipGroup.position.copy(ship.pos);
        shipGroup.rotation.set(ship.pitch, ship.yaw, 0, "YXZ");

        const throttleTarget = thrust.lengthSq() > 0 ? 1 : 0.15;
        ship.throttle = THREE.MathUtils.lerp(ship.throttle, throttleTarget, 0.12);
        const flicker = 0.85 + Math.sin(t * 45) * 0.08 + Math.sin(t * 13) * 0.05;
        const flameStretch = (0.5 + ship.throttle * 1.6) * flicker;
        engines.forEach(({ flameInner, flameOuter }) => {
          flameInner.scale.z = 0.85 * flameStretch;
          flameOuter.scale.z = 1.15 * flameStretch;
          flameInner.material.opacity = 0.4 + ship.throttle * 0.55;
          flameOuter.material.opacity = (0.25 + ship.throttle * 0.4) * flicker;
        });

        // Third-person chase camera: trails behind and slightly above,
        // banking with the ship instead of snapping rigidly to it.
        const chaseOffset = new THREE.Vector3(0, 0.55, 2.2).applyEuler(
          new THREE.Euler(ship.pitch * 0.4, ship.yaw, 0, "YXZ")
        );
        camera.position.lerp(ship.pos.clone().add(chaseOffset), 0.14);
        camera.up.set(0, 1, 0);
        camera.lookAt(ship.pos.clone().addScaledVector(forward, 2.5));

        // Navigation beacons — fly close enough to one and it docks you
        // straight into that section, exiting pilot mode automatically.
        let nearestLabel = null;
        let nearestDist = Infinity;
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
          }
          if (dist < DOCK_RADIUS) onDock?.(b.id);
        });
        if (nearestLabel && nearestDist < 6) {
          beaconLabel.textContent =
            nearestDist < DOCK_RADIUS ? `DOCKING — ${nearestLabel.toUpperCase()}` : `${nearestLabel.toUpperCase()} — ${nearestDist.toFixed(1)}u`;
          beaconLabel.style.opacity = "1";
        } else {
          beaconLabel.style.opacity = "0";
        }
      } else {
        shipGroup.visible = false;
        beacons.forEach((b) => (b.group.visible = false));
        beaconLabel.style.opacity = "0";

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
      const targetLensStrength =
        0.006 + (isBlobHovered ? 0.014 : 0) + Math.min(Math.abs(scrollVelocity.current) * 0.0008, 0.008);
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
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
        if (beaconLabel.parentNode === mount) {
          mount.removeChild(beaconLabel);
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
