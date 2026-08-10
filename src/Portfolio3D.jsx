import React, { useEffect, useRef, useState } from "react";
import katawareImg from "./assets/kataware.jpg";

/* three.js is loaded lazily inside ThreeBackground's effect (dynamic
   import()) — it's the bulk of the JS bundle and has no business gating
   first paint of the hero text. Vite splits it into its own chunk. */

/* ---------------------------------------------------------
   DESIGN NOTES (for Shadiq, not rendered)

   Same monochrome ink-brush language as the 2D version, now
   driven by an actual WebGL scene instead of SVG:

   - A single irregular "ink blob" (displaced icosahedron,
     wireframe) sits at the center of the world and rotates
     as you scroll — its rotation literally encodes how far
     through the page you are, so it's read progress, not
     decoration. Hovering it (and real GitHub commit activity)
     speeds up its rotation.
   - A handful of hand-placed TubeGeometry "brush strokes"
     drift slowly around it and brighten on hover.
   - The particle field is a real N-body gravity simulation, not
     a scripted animation: every particle is pulled toward the
     blob and weakly toward every other particle (full O(n^2)
     pairwise gravity, integrated with an actual velocity each
     frame — no shortcuts). The pointer is a second, movable
     gravity well; a click is a brief repulsive kick on top.
   - The post-process pass (chromatic aberration, vignette,
     grain) also bends sampled UVs around the blob's screen
     position — a small gravitational-lensing effect that tracks
     the blob and intensifies slightly on hover.
   - Camera flies a designed bezier path (not a straight dolly)
     as you scroll, with a subtle roll.
   - Pointer position adds gentle parallax to the whole scene.
   - Opt-in "pilot mode" (nav button / command palette / "PILOT")
     swaps the scroll-driven camera for free-flight: WASD/arrows
     + space/shift thrust, mouse position steers (offset from
     center = turn), no pointer lock. A visible low-poly wireframe
     ship (matching the blob's line language) flies with a
     third-person chase camera, twin engines flaring with actual
     combustion cones that stretch/brighten with throttle.
   - Four glowing waypoint beacons, one per nav section, are
     placed around the scene during pilot mode — fly close enough
     to one and it docks you straight into that section, exiting
     pilot mode automatically. This is the actual point of pilot
     mode: a second, literal way to navigate the site, not just a
     flight-sim toy layered on top of it.
   - Escape (or the same toggle) exits without docking and hands
     the scroll camera back exactly where it left off.

   Content sits in normal document flow (real scroll, no
   scroll-jacking) on top of a fixed full-viewport canvas —
   so it stays accessible and works with reduced-motion.
--------------------------------------------------------- */

const FONT_LINK_ID = "shadiq-portfolio-fonts";
const PAPER = 0xf4f1e8;
const RUST = 0x7a2b22;

function useGoogleFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

/* ---------- Ink Cursor (verlet-trailed blob, canvas layer) ---------- */
function InkCursor() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const POINTS = 7;
    const chain = Array.from({ length: POINTS }, () => ({ x: -100, y: -100 }));
    const target = { x: -100, y: -100 };
    let seeded = false;
    function onMove(e) {
      target.x = e.clientX;
      target.y = e.clientY;
      if (!seeded) {
        chain.forEach((p) => { p.x = target.x; p.y = target.y; });
        seeded = true;
      }
    }
    window.addEventListener("pointermove", onMove);

    let raf;
    function tick() {
      raf = requestAnimationFrame(tick);
      const lead = reduced ? 1 : 0.5;
      const follow = reduced ? 1 : 0.42;
      chain[0].x += (target.x - chain[0].x) * lead;
      chain[0].y += (target.y - chain[0].y) * lead;
      for (let i = 1; i < POINTS; i++) {
        chain[i].x += (chain[i - 1].x - chain[i].x) * follow;
        chain[i].y += (chain[i - 1].y - chain[i].y) * follow;
      }

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (!reduced) {
        ctx.beginPath();
        ctx.moveTo(chain[0].x, chain[0].y);
        for (let i = 1; i < POINTS - 1; i++) {
          const mx = (chain[i].x + chain[i + 1].x) / 2;
          const my = (chain[i].y + chain[i + 1].y) / 2;
          ctx.quadraticCurveTo(chain[i].x, chain[i].y, mx, my);
        }
        const tail = chain[POINTS - 1];
        ctx.lineTo(tail.x, tail.y);
        ctx.strokeStyle = "rgba(122,43,34,0.35)";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      const grad = ctx.createRadialGradient(chain[0].x, chain[0].y, 0, chain[0].x, chain[0].y, 11);
      grad.addColorStop(0, "rgba(122,43,34,0.95)");
      grad.addColorStop(0.5, "rgba(122,43,34,0.4)");
      grad.addColorStop(1, "rgba(122,43,34,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(chain[0].x, chain[0].y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={canvasRef} className="ink-cursor" aria-hidden="true" />;
}

/* ---------- Hero Title (staggered letters) ---------- */
function HeroTitle({ text }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 300); return () => clearTimeout(t); }, []);
  return (
    <h1 className="hero-name display">
      {text.split("").map((ch, i) => (
        <span
          key={i}
          className={`hero-letter ${visible ? "hero-letter-in" : ""}`}
          style={{ transitionDelay: `${i * 70 + 100}ms` }}
        >
          {ch}
        </span>
      ))}
    </h1>
  );
}

/* ---------- Live GitHub activity ---------- */
function useGithubActivity() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("https://api.github.com/users/shadiqash/events/public")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((events) => {
        if (cancelled || !Array.isArray(events)) return;
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const recent = events.filter(
          (e) =>
            (e.type === "PushEvent" || e.type === "PullRequestEvent") &&
            new Date(e.created_at).getTime() > cutoff
        );
        setCount(recent.length);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}

function GithubPulse({ count }) {
  if (count === null) return null;
  return (
    <div className="github-pulse">
      <span className="pulse-dot" aria-hidden="true" />
      {count > 0
        ? `${count} commit${count === 1 ? "" : "s"} on GitHub, past 14 days`
        : "quiet on GitHub the past 14 days"}
    </div>
  );
}

/* ---------- Tilt Card ---------- */
function TiltCard({ children, className = "" }) {
  const ref = useRef(null);
  function onMove(e) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.transform = `perspective(800px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg) scale(1.02)`;
  }
  function onLeave() { if (ref.current) ref.current.style.transform = ""; }
  return (
    <div ref={ref} className={className} onMouseMove={onMove} onMouseLeave={onLeave} onMouseEnter={playThock} style={{ transition: "transform 0.2s ease" }}>
      {children}
    </div>
  );
}

/* ---------- Magnetic Link ---------- */
function MagneticLink({ children, href, className = "", onClick }) {
  const ref = useRef(null);
  function onMove(e) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) * 0.25;
    const dy = (e.clientY - cy) * 0.25;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function onLeave() { if (ref.current) ref.current.style.transform = ""; }
  return (
    <a ref={ref} href={href} className={className} onClick={onClick}
       onMouseMove={onMove} onMouseLeave={onLeave} onMouseEnter={playThock}
       style={{ transition: "transform 0.2s ease", display: "inline-block" }}>
      {children}
    </a>
  );
}

/* ---------- Section Divider ---------- */
function SectionDivider() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.unobserve(el); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="section-divider">
      <svg viewBox="0 0 800 4" preserveAspectRatio="none">
        <line className={`divider-line ${inView ? "drawn" : ""}`} x1="0" y1="2" x2="800" y2="2" />
      </svg>
    </div>
  );
}

/* ---------- Web Audio SFX ---------- */
let audioCtx = null;
function playThock() {
  if (!window.AudioContext && !window.webkitAudioContext) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.05);
  
  gain.gain.setValueAtTime(0, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
  
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.1);
}

/* ---------- Ambient drone (opt-in, gated by the sound toggle) ---------- */
function useAmbientDrone(enabled, scrollRef) {
  const nodesRef = useRef(null);
  useEffect(() => {
    if (!enabled) {
      const active = nodesRef.current;
      if (active) {
        active.gain.gain.linearRampToValueAtTime(0, active.ctx.currentTime + 0.6);
        setTimeout(() => {
          active.osc1.stop();
          active.osc2.stop();
        }, 700);
        nodesRef.current = null;
      }
      return;
    }
    if (!window.AudioContext && !window.webkitAudioContext) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 55;
    osc2.type = "sine";
    osc2.frequency.value = 55 * 1.5;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc1.start();
    osc2.start();
    gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 1.2);
    nodesRef.current = { osc1, osc2, gain, filter, ctx: audioCtx };

    let raf;
    function followScroll() {
      raf = requestAnimationFrame(followScroll);
      filter.frequency.value = 350 + (scrollRef.current || 0) * 900;
    }
    followScroll();

    return () => cancelAnimationFrame(raf);
  }, [enabled, scrollRef]);

  useEffect(
    () => () => {
      const active = nodesRef.current;
      if (active) {
        try {
          active.osc1.stop();
          active.osc2.stop();
        } catch {
          /* already stopped */
        }
      }
    },
    []
  );
}

/* ---------- Boot Sequence Loader ---------- */
function BootLoader() {
  const [booting, setBooting] = useState(true);
  const [text, setText] = useState("");
  useEffect(() => {
    const msgs = ["INITIALIZING SYNC...", "LOADING TRUST LAYERS...", "SYSTEM READY."];
    let i = 0;
    const interval = setInterval(() => {
      setText(msgs[i]);
      i++;
      if (i >= msgs.length) {
        clearInterval(interval);
        setTimeout(() => setBooting(false), 500);
      }
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  if (!booting) return null;
  return (
    <div className="boot-loader">
      <div className="boot-text">
        {text}<span className="boot-cursor">_</span>
      </div>
    </div>
  );
}

/* ---------- Hacker Text Scramble ---------- */
function ScrambleText({ text, className = "" }) {
  const [displayText, setDisplayText] = useState(text.replace(/./g, '_'));
  const ref = useRef(null);
  
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        obs.unobserve(el);
        let iteration = 0;
        const chars = "01!@#$%^&*()_+<>?[]{}";
        const interval = setInterval(() => {
          setDisplayText(text.split("").map((letter, index) => {
            if(index < iteration) return text[index];
            if(text[index] === " ") return " ";
            return chars[Math.floor(Math.random() * chars.length)];
          }).join(""));
          if(iteration >= text.length) clearInterval(interval);
          iteration += 1 / 3; 
        }, 30);
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [text]);
  
  return <h2 ref={ref} className={className}>{displayText}</h2>;
}

function Reveal({ as: Tag = "div", className = "", children, delay = 0, style = {}, ...rest }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? "in-view" : ""} ${className}`}
      style={{ ...style, transitionDelay: inView ? `${delay}ms` : "0ms" }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function BrushUnderline() {
  return (
    <svg className="brush-underline" viewBox="0 0 340 20" preserveAspectRatio="none" aria-hidden="true">
      <path
        className="brush-path"
        d="M4 12 C 60 2, 90 18, 150 9 S 230 3, 280 13 S 320 15, 336 10"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---------- Command Palette (psql-styled ⌘K) ---------- */
function CommandPalette({ open, onClose, onNavigate, soundOn, onToggleSound, onShockwave, pilotMode, onTogglePilot }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const commands = [
    { id: "work", label: "Go to Work", hint: "\\c work", action: () => onNavigate("work") },
    { id: "about", label: "Go to About", hint: "\\c about", action: () => onNavigate("about") },
    { id: "now", label: "Go to Off the Clock", hint: "\\c now", action: () => onNavigate("now") },
    { id: "contact", label: "Go to Contact", hint: "\\c contact", action: () => onNavigate("contact") },
    {
      id: "email",
      label: "Copy email address",
      hint: "shadiqpoke@gmail.com",
      action: () => navigator.clipboard?.writeText("shadiqpoke@gmail.com"),
    },
    {
      id: "github",
      label: "Open GitHub",
      hint: "github.com/shadiqash",
      action: () => window.open("https://github.com/shadiqash", "_blank", "noreferrer"),
    },
    {
      id: "linkedin",
      label: "Open LinkedIn",
      hint: "linkedin.com/in/shadiq-shah",
      action: () => window.open("https://www.linkedin.com/in/shadiq-shah-3944422b1/", "_blank", "noreferrer"),
    },
    {
      id: "resume",
      label: "Download résumé",
      hint: "resume.pdf",
      action: () => window.open("/resume.pdf", "_blank", "noreferrer"),
    },
    {
      id: "sound",
      label: soundOn ? "Turn ambient sound off" : "Turn ambient sound on",
      hint: "toggle audio",
      action: onToggleSound,
    },
    {
      id: "pilot",
      label: pilotMode ? "Exit pilot mode" : "Enter pilot mode",
      hint: pilotMode ? "esc" : "fly through the gravity sim",
      action: onTogglePilot,
    },
    {
      id: "diagnostic",
      label: "Run diagnostic",
      hint: "select pg_sleep(0); -- shockwave",
      action: onShockwave,
    },
  ];

  const filtered = commands.filter((c) =>
    (c.label + " " + c.hint).toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  function run(cmd) {
    cmd?.action?.();
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[selected]);
    }
  }

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-prompt">
          <span className="palette-sigil">shadiq=#</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search commands..."
            aria-label="Command search"
          />
        </div>
        <div className="palette-list" role="listbox">
          {filtered.length === 0 && <div className="palette-empty">no matching command</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              role="option"
              aria-selected={i === selected}
              className={`palette-item ${i === selected ? "active" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => run(c)}
            >
              <span>{c.label}</span>
              <span className="palette-hint">{c.hint}</span>
            </div>
          ))}
        </div>
        <div className="palette-foot">↑↓ navigate · ↵ run · esc close</div>
      </div>
    </div>
  );
}

/* Cheap, dependency-free check for whether WebGL is actually usable —
   Brave Shields, disabled hardware acceleration, or a blocked GPU can
   all make context creation fail even though Three.js itself is fine. */
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

/* ---------------- Three.js background ---------------- */
function ThreeBackground({ scrollRef, reducedMotion, onUnavailable, activity, triggerRef, pilotMode, onDock }) {
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

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.location.hash = id;
  }
}

/* ---------------- Content ---------------- */
const NAV_LINKS = [
  { id: "work", label: "Work" },
  { id: "about", label: "About" },
  { id: "now", label: "Off the Clock" },
  { id: "contact", label: "Contact" },
];

const PROJECTS = [
  {
    title: "Kukhra",
    tagline: "Inventory & POS for a poultry supply chain",
    body: "A Django/DRF backend tracking chicken from farm production through warehouses to 12 retail outlets — append-only stock ledgers instead of mutable balances, dated price rows so old orders keep their original price, and lot-level tracing for recalls. Built with a co-founder as a side project, not a client engagement.",
    tags: ["Django", "PostgreSQL", "Celery", "React"],
  },
  {
    title: "InfraWatch",
    tagline: "PostgreSQL control panel",
    body: "A 9-page control panel — Dashboard, Activity, Slow Queries, Table Health, Indexes, Replication, Permissions, Schema, NOC Report — built to replace a manual DataGrip / Termius workflow with one live view of the database. A lighter companion tool tracks schema drift the same way, deployed on a phone over Termux out of pure stubbornness.",
    tags: ["PostgreSQL", "Ops tooling", "SPA"],
  },
  {
    title: "Company Onboarding FAQ Bot",
    tagline: "RAG assistant for internal onboarding",
    body: "A retrieval-augmented onboarding assistant running on pgvector for storage, nomic-embed-text via Ollama for embeddings, and llama3.1:8b as the local model, with a GLM API toggle planned alongside a minimal frontend.",
    tags: ["RAG", "pgvector", "Ollama", "Llama 3.1"],
  },
  {
    title: "Spotit",
    tagline: "Cross-platform music, built fast",
    body: "A Flutter music app with local recommendation logic and YouTube audio streaming — a full Home screen with discovery shelves, Hive-backed downloads, YouTube Music / Spotify import, and mobile hardening via audio_service. Mobile kept as a separate codebase from desktop to ship faster.",
    tags: ["Flutter", "Hive", "audio_service"],
  },
];

export default function Portfolio3D() {
  useGoogleFonts();
  const [navOpen, setNavOpen] = useState(false);
  const scrollRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webglOK, setWebglOK] = useState(true);
  const [activeSection, setActiveSection] = useState("work");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [pilotMode, setPilotMode] = useState(false);
  const shockwaveTriggerRef = useRef(null);
  const githubActivity = useGithubActivity();
  const activity = Math.min((githubActivity || 0) / 8, 1);

  useAmbientDrone(soundOn, scrollRef);

  // Pilot mode pauses normal page scrolling — you're flying the camera
  // yourself, so the scroll-driven dolly has nothing to drive.
  useEffect(() => {
    document.body.style.overflow = pilotMode ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [pilotMode]);

  useEffect(() => {
    function onKey(e) {
      const typing = document.activeElement?.tagName === "INPUT";
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (pilotMode) setPilotMode(false);
        else setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pilotMode]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.("change", onChange);

    function onScroll() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      mq.removeEventListener?.("change", onChange);
    };
  }, []);

  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.id);
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="page">
      <style>{`
        @property --ink-r {
          syntax: '<percentage>';
          inherits: false;
          initial-value: 0%;
        }
        :root {
          --ink: #0b0b0a;
          --paper: #f4f1e8;
          --ash: #8c887e;
          --charcoal: #171613;
          --rust: #7a2b22;
        }
        * { box-sizing: border-box; cursor: none; }
        html, body { background: var(--ink); }

        /* Ink cursor */
        .ink-cursor {
          position: fixed; inset: 0; z-index: 9999;
          pointer-events: none; mix-blend-mode: screen;
        }
        a, button { cursor: none; }

        /* Command palette */
        .palette-scrim {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(6,6,5,0.7); backdrop-filter: blur(2px);
          display: flex; align-items: flex-start; justify-content: center;
          padding-top: 14vh;
        }
        .palette {
          width: min(560px, 90vw);
          background: var(--charcoal); border: 1px solid #35332c;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .palette-prompt {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 18px; border-bottom: 1px solid #2a2924;
        }
        .palette-sigil { color: var(--rust); font-size: 14px; }
        .palette-prompt input {
          flex: 1; background: none; border: none; outline: none;
          color: var(--paper); font-family: inherit; font-size: 14px; cursor: text;
        }
        .palette-list { max-height: 50vh; overflow-y: auto; }
        .palette-item {
          display: flex; justify-content: space-between; gap: 16px;
          padding: 12px 18px; font-size: 13.5px; cursor: pointer;
        }
        .palette-item.active { background: rgba(122,43,34,0.18); color: var(--rust); }
        .palette-hint { color: var(--ash); font-size: 12px; }
        .palette-item.active .palette-hint { color: inherit; opacity: 0.75; }
        .palette-empty { padding: 16px 18px; color: var(--ash); font-size: 13px; }
        .palette-foot {
          padding: 10px 18px; border-top: 1px solid #2a2924;
          font-size: 11px; letter-spacing: 0.05em; color: var(--ash);
        }
        /* Boot Loader */
        .boot-loader {
          position: fixed; inset: 0; z-index: 99999;
          background: var(--ink); color: var(--rust);
          display: flex; align-items: center; justify-content: center;
          font-family: 'IBM Plex Mono', monospace; font-size: 14px;
        }
        .boot-cursor { animation: blink 1s step-end infinite; }
        @keyframes blink { 50% { opacity: 0; } }

        .page {
          background: var(--ink);
          color: var(--paper);
          font-family: 'IBM Plex Mono', monospace;
          position: relative;
        }
        .three-mount {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }
        .three-mount canvas { display: block; width: 100% !important; height: 100% !important; }
        .three-fallback {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse at 50% 20%, rgba(244,241,232,0.06), transparent 60%),
            var(--ink);
        }
        .webgl-note {
          position: fixed; bottom: 14px; right: 14px; z-index: 41;
          font-size: 11px; letter-spacing: 0.04em; color: var(--ash);
          background: rgba(11,11,10,0.8); border: 1px solid #2a2924;
          padding: 8px 12px; max-width: 240px; line-height: 1.5;
        }

        .pilot-hud { position: fixed; inset: 0; z-index: 50; pointer-events: none; }
        .pilot-hint {
          position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%);
          font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ash);
          background: rgba(11,11,10,0.75); border: 1px solid #2a2924; padding: 8px 16px;
          white-space: nowrap;
        }
        .beacon-label {
          position: absolute; top: 90px; left: 50%; z-index: 5;
          transform: translateX(-50%); font-size: 13px; letter-spacing: 0.08em;
          color: var(--rust); background: rgba(11,11,10,0.8); border: 1px solid var(--rust);
          padding: 8px 18px; opacity: 0; transition: opacity 0.2s ease; white-space: nowrap;
        }

        .content { position: relative; z-index: 1; }

        .display {
          font-family: 'Big Shoulders Display', sans-serif;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.01em;
          line-height: 0.86;
        }
        a { color: inherit; text-decoration: none; }

        .panel {
          background: rgba(11, 11, 10, 0.72);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }

        .brush-path { stroke: var(--paper); stroke-width: 3; fill: none; }
        .brush-underline {
          position: absolute; left: -2%; bottom: -0.18em; width: 104%; height: 0.3em; overflow: visible;
        }
        .brush-underline .brush-path { stroke-dasharray: 400; stroke-dashoffset: 400; transition: stroke-dashoffset 0.9s cubic-bezier(.2,.7,.2,1); }
        .in-view .brush-underline .brush-path { stroke-dashoffset: 0; }

        .reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .reveal.in-view { opacity: 1; transform: translateY(0); }

        .nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 40;
          display: flex; justify-content: space-between; align-items: center;
          padding: 22px clamp(20px, 5vw, 56px);
          font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
        }
        .nav-left { display: flex; align-items: center; gap: 12px; }
        .nav-mark { font-family: 'Big Shoulders Display', sans-serif; font-weight: 800; font-size: 20px; letter-spacing: 0.02em; }
        .nav-util {
          background: none; border: 1px solid #35332c; color: var(--ash);
          font-family: inherit; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase;
          padding: 5px 10px; border-radius: 100px; cursor: pointer; transition: border-color 0.2s ease, color 0.2s ease;
        }
        .nav-util:hover, .nav-util[aria-pressed="true"] { border-color: var(--rust); color: var(--rust); }
        @media (max-width: 560px) { .nav-util { display: none; } }
        .nav-links { display: flex; gap: 28px; }
        .nav-link { position: relative; opacity: 0.72; padding-bottom: 4px; transition: opacity 0.2s ease, color 0.2s ease; }
        .nav-link:hover { opacity: 1; }
        .nav-link .brush-underline { opacity: 0; transition: opacity 0.25s ease; }
        .nav-link .brush-underline .brush-path { stroke-dashoffset: 400; }
        .nav-link:hover .brush-underline { opacity: 1; }
        .nav-link:hover .brush-underline .brush-path { stroke-dashoffset: 0; }
        .nav-link.active { opacity: 1; color: var(--rust); }
        .nav-link.active .brush-underline { opacity: 1; }
        .nav-link.active .brush-underline .brush-path { stroke: var(--rust); stroke-dashoffset: 0; }
        .nav-toggle { display: none; background: none; border: none; color: var(--paper); font-family: inherit; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
        @media (max-width: 720px) {
          .nav-links { display: none; }
          .nav-toggle { display: block; }
          .nav-links.open { display: flex; position: fixed; top: 60px; right: 20px; background: var(--charcoal); border: 1px solid #2a2924; padding: 16px 22px; flex-direction: column; gap: 14px; }
        }

        .hero { position: relative; min-height: 100svh; display: flex; flex-direction: column; justify-content: center; padding: 0 clamp(20px, 6vw, 64px); }
        .eyebrow { font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--ash); margin-bottom: 18px; }
        .eyebrow::before { content: "— "; color: var(--rust); }
        .hero-name { font-size: clamp(58px, 13vw, 172px); margin: 0; overflow: hidden; }
        .hero-letter {
          display: inline-block; opacity: 0; transform: translateY(100%) rotateX(-40deg);
          transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        .hero-letter-in { opacity: 1; transform: translateY(0) rotateX(0deg); }
        .hero-role { margin-top: 26px; max-width: 620px; font-size: clamp(15px, 2vw, 18px); line-height: 1.7; padding: 18px 22px; }
        .hero-role .ash { color: var(--ash); }
        .github-pulse {
          display: flex; align-items: center; gap: 8px; margin-top: 18px;
          font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ash);
        }
        .pulse-dot {
          width: 7px; height: 7px; border-radius: 50%; background: var(--rust);
          box-shadow: 0 0 8px 2px rgba(122,43,34,0.6); animation: pulse-dot 1.8s ease-in-out infinite;
        }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
        .scroll-cue { position: absolute; bottom: 34px; left: clamp(20px, 6vw, 64px); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ash); display: flex; align-items: center; gap: 10px; }
        .scroll-cue .line { width: 34px; height: 1px; background: var(--ash); position: relative; overflow: hidden; }
        .scroll-cue .line::after { content: ""; position: absolute; inset: 0; background: var(--paper); animation: slide 1.8s ease-in-out infinite; }
        @keyframes slide { 0% { transform: translateX(-100%); } 50% { transform: translateX(0); } 100% { transform: translateX(100%); } }

        section {
          position: relative; padding: 120px clamp(20px, 6vw, 64px);
          background: linear-gradient(180deg, transparent 0%, rgba(11,11,10,0.6) 15%, rgba(11,11,10,0.75) 50%, rgba(11,11,10,0.6) 85%, transparent 100%);
        }

        /* Section Divider */
        .section-divider { padding: 0 clamp(20px, 6vw, 64px); overflow: hidden; }
        .section-divider svg { width: 100%; height: 4px; }
        .divider-line { stroke: var(--rust); stroke-width: 1; opacity: 0.5; stroke-dasharray: 800; stroke-dashoffset: 800; transition: stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1); }
        .divider-line.drawn { stroke-dashoffset: 0; }
        .section-head {
          display: flex; align-items: baseline; gap: 18px; margin-bottom: 54px;
          --ink-r: 0%;
          mask-image:
            radial-gradient(circle at 10% 60%, black 0%, black var(--ink-r), transparent calc(var(--ink-r) + 22%)),
            radial-gradient(circle at 55% 30%, black 0%, black var(--ink-r), transparent calc(var(--ink-r) + 26%)),
            radial-gradient(circle at 85% 70%, black 0%, black var(--ink-r), transparent calc(var(--ink-r) + 20%));
          -webkit-mask-image:
            radial-gradient(circle at 10% 60%, black 0%, black var(--ink-r), transparent calc(var(--ink-r) + 22%)),
            radial-gradient(circle at 55% 30%, black 0%, black var(--ink-r), transparent calc(var(--ink-r) + 26%)),
            radial-gradient(circle at 85% 70%, black 0%, black var(--ink-r), transparent calc(var(--ink-r) + 20%));
          mask-composite: add;
          -webkit-mask-composite: source-over;
          transition: opacity 0.7s ease, transform 0.7s ease, --ink-r 0.9s cubic-bezier(.2,.7,.2,1);
        }
        .section-head.in-view { --ink-r: 140%; }
        .section-num { color: var(--rust); font-size: 13px; letter-spacing: 0.1em; }
        .section-title { font-size: clamp(34px, 5vw, 56px); margin: 0; }

        .about-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; }
        @media (max-width: 800px) { .about-grid { grid-template-columns: 1fr; } }
        .about-copy { padding: 26px 28px; }
        .about-copy p { font-size: clamp(16px, 2vw, 20px); line-height: 1.85; margin: 0 0 22px; }
        .about-copy p:last-child { margin-bottom: 0; }
        .about-copy .ash { color: var(--ash); }
        .skills-strip { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
        .skill-chip {
          font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--paper);
          border: 1px solid #35332c; padding: 6px 12px; border-radius: 100px;
          opacity: 0; transform: translateY(12px) scale(0.85);
          transition: opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1), border-color 0.3s ease, background 0.3s ease;
        }
        .in-view .skill-chip { opacity: 1; transform: translateY(0) scale(1); }
        .in-view .skill-chip:nth-child(1) { transition-delay: 0.1s; }
        .in-view .skill-chip:nth-child(2) { transition-delay: 0.2s; }
        .in-view .skill-chip:nth-child(3) { transition-delay: 0.3s; }
        .in-view .skill-chip:nth-child(4) { transition-delay: 0.4s; }
        .in-view .skill-chip:nth-child(5) { transition-delay: 0.5s; }
        .skill-chip:hover { border-color: var(--rust); background: rgba(122,43,34,0.15); }
        .strip-label { color: var(--rust); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin: 20px 0 10px; }
        .open-to { display: inline-block; color: var(--rust); font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 26px; }
        .fact-list { list-style: none; margin: 0; padding: 22px 26px; border-top: 1px solid #2a2924; }
        .fact-list li { display: flex; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid #2a2924; font-size: 14px; }
        .fact-list li:last-child { border-bottom: none; padding-bottom: 0; }
        .fact-list .k { color: var(--ash); letter-spacing: 0.05em; text-transform: uppercase; font-size: 12px; }
        .fact-list .v { text-align: right; }

        .project { padding: 30px 28px; margin-bottom: 22px; transition: transform 0.2s ease, box-shadow 0.3s ease; }
        .project:hover { box-shadow: 0 0 40px rgba(122,43,34,0.08); }
        .project-top { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; flex-wrap: wrap; }
        .project-title { font-family: 'Big Shoulders Display', sans-serif; font-weight: 700; text-transform: uppercase; font-size: clamp(26px, 4vw, 42px); margin: 0; }
        .project-tagline { color: var(--rust); font-size: 13px; letter-spacing: 0.05em; white-space: nowrap; }
        .project-body { max-width: 640px; color: var(--ash); line-height: 1.8; margin: 14px 0 16px; font-size: 14.5px; }
        .tag-row { display: flex; flex-wrap: wrap; gap: 10px; }
        .tag {
          font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
          border: 1px solid #35332c; padding: 6px 12px; border-radius: 100px;
          transition: border-color 0.3s ease, color 0.3s ease, background 0.3s ease;
        }
        .tag:hover { border-color: var(--rust); color: var(--rust); background: rgba(122,43,34,0.1); }

        .now-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
        @media (max-width: 900px) { .now-grid { grid-template-columns: 1fr; } }
        .now-card {
          padding: 30px 26px; min-height: 190px; display: flex; flex-direction: column;
          justify-content: space-between; border: 1px solid #262520;
          transition: border-color 0.4s ease, box-shadow 0.4s ease, transform 0.3s ease;
        }
        .now-card:hover { border-color: var(--rust); box-shadow: 0 0 30px rgba(122,43,34,0.12); transform: translateY(-4px); }
        .now-card-media { padding: 0; overflow: hidden; }
        .now-card-media > div { padding: 22px 24px 26px; }
        .now-render { width: 100%; height: 150px; object-fit: cover; display: block; filter: saturate(0.9) contrast(1.05); }
        .now-card h3 { font-family: 'Big Shoulders Display', sans-serif; text-transform: uppercase; font-size: 24px; margin: 0 0 12px; }
        .now-card p { color: var(--ash); font-size: 14px; line-height: 1.7; margin: 0; }
        .now-tag { color: var(--rust); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px; }

        .contact { padding-bottom: 160px; }
        .contact-title {
          font-size: clamp(40px, 8vw, 96px); margin: 0 0 36px;
          animation: breathe 4s ease-in-out infinite;
        }
        @keyframes breathe {
          0%, 100% { text-shadow: 0 0 0px transparent; }
          50% { text-shadow: 0 0 30px rgba(122,43,34,0.35), 0 0 60px rgba(122,43,34,0.15); }
        }
        .contact-links { display: flex; flex-wrap: wrap; gap: 16px 40px; padding: 22px 26px; }
        .contact-links a {
          position: relative; font-size: 15px; letter-spacing: 0.05em; text-transform: uppercase;
          padding-bottom: 4px; transition: color 0.3s ease, transform 0.2s ease; display: inline-block;
        }
        .contact-links a:hover { color: var(--rust); }
        .contact-links a .brush-underline { opacity: 0; transition: opacity 0.25s ease; }
        .contact-links a:hover .brush-underline { opacity: 1; }
        .contact-links a:hover .brush-underline .brush-path { stroke-dashoffset: 0; }
        .fine-print { margin-top: 60px; color: var(--ash); font-size: 12px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; border-top: 1px solid #2a2924; padding-top: 22px; }

        @media (prefers-reduced-motion: reduce) {
          .reveal, .brush-underline .brush-path { transition: none !important; }
        }
      `}</style>

      <BootLoader />
      {!pilotMode && <InkCursor />}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(id) => {
          setPaletteOpen(false);
          scrollToSection(id);
        }}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
        onShockwave={() => shockwaveTriggerRef.current?.(0, 0)}
        pilotMode={pilotMode}
        onTogglePilot={() => {
          setPaletteOpen(false);
          setPilotMode((v) => !v);
        }}
      />

      {pilotMode && (
        <div className="pilot-hud" aria-hidden="true">
          <div className="pilot-hint">
            PILOT MODE — WASD / arrows to move · space / shift for up-down · mouse to steer · fly into a glowing marker to dock · esc to exit
          </div>
        </div>
      )}

      {webglOK ? (
        <ThreeBackground
          scrollRef={scrollRef}
          reducedMotion={reducedMotion}
          onUnavailable={() => setWebglOK(false)}
          activity={activity}
          triggerRef={shockwaveTriggerRef}
          pilotMode={pilotMode}
          onDock={(id) => {
            setPilotMode(false);
            scrollToSection(id);
          }}
        />
      ) : (
        <>
          <div className="three-fallback" />
          <div className="webgl-note">
            WebGL isn't available here (blocked or disabled), so this is showing a
            flat backdrop instead of the 3D scene.
          </div>
        </>
      )}

      <div className="content">
        <nav className="nav">
          <div className="nav-left">
            <span className="nav-mark">SHADIQ /</span>
            <button className="nav-util" onClick={() => setPaletteOpen(true)} aria-label="Open command menu">
              ⌘K
            </button>
            <button
              className="nav-util"
              onClick={() => setSoundOn((v) => !v)}
              aria-pressed={soundOn}
              aria-label="Toggle ambient sound"
            >
              {soundOn ? "SND ON" : "SND OFF"}
            </button>
            {webglOK && (
              <button
                className="nav-util"
                onClick={() => setPilotMode((v) => !v)}
                aria-pressed={pilotMode}
                aria-label="Toggle pilot mode"
              >
                {pilotMode ? "EXIT SHIP" : "PILOT"}
              </button>
            )}
          </div>
          <button className="nav-toggle" onClick={() => setNavOpen((v) => !v)}>
            {navOpen ? "Close" : "Menu"}
          </button>
          <div className={`nav-links ${navOpen ? "open" : ""}`}>
            {NAV_LINKS.map((l) => (
              <MagneticLink
                key={l.id}
                href={`#${l.id}`}
                className={`nav-link ${activeSection === l.id ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setNavOpen(false);
                  scrollToSection(l.id);
                }}
              >
                {l.label}
                <BrushUnderline />
              </MagneticLink>
            ))}
          </div>
        </nav>

        <header className="hero">
          <div className="eyebrow">Database Administrator &amp; Tech Enthusiast — Kathmandu, Nepal</div>
          <HeroTitle text="Shadiq" />
          <p className="hero-role panel">
            I work on the data and trust layers of AI systems — retrieval
            pipelines, database tooling, and the unglamorous infrastructure
            that keeps the rest of it honest.{" "}
            <span className="ash">
              A database administrator by background, still thinking like
              one no matter what I'm building.
            </span>
          </p>
          <GithubPulse count={githubActivity} />
          <div className="scroll-cue">
            <span className="line" />
            Scroll
          </div>
        </header>

        <section id="work">
          <Reveal className="section-head panel" style={{ display: "inline-flex" }}>
            <span className="section-num">Work</span>
            <ScrambleText className="section-title display" text="Selected Projects" />
          </Reveal>
          <div>
            {PROJECTS.map((p, i) => (
              <Reveal as="article" className="project-wrapper" delay={i * 60} key={p.title}>
                <TiltCard className="project panel">
                  <div className="project-top">
                    <h3 className="project-title display">{p.title}</h3>
                    <span className="project-tagline">{p.tagline}</span>
                  </div>
                  <p className="project-body">{p.body}</p>
                  <div className="tag-row">
                    {p.tags.map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </section>

        <SectionDivider />

        <section id="about">
          <Reveal className="section-head">
            <span className="section-num">About</span>
            <ScrambleText className="section-title display" text="Who's Behind This" />
          </Reveal>
          <div className="about-grid">
            <Reveal className="about-copy panel">
              <p>
                I'm Shadiq — a database administrator and tech enthusiast
                working on the data and trust layers of AI systems: retrieval
                pipelines, schema design, and the infrastructure underneath
                them. Being a DBA at heart means I still can't look at a
                system without wondering how it fails.
              </p>
              <p className="ash">
                Right now I'm also finishing a BCA, and picking up work as a DB intern at
                EDN along the way.
              </p>
              <p>
                Most of what's here — the Django/DRF backends, a 449-file
                Flutter app, raw SQL, React frontends — I built by writing
                the spec and constraints and directing an AI agent through
                it commit by commit, not by hand-typing every line. The
                pattern holds across a dozen real repos, including one with
                237 commits of sustained AI co-authorship.
              </p>
              <div className="skills-strip">
                {["PostgreSQL", "FastAPI", "pgvector", "Ollama / Llama", "Flutter"].map(
                  (s) => (
                    <span className="skill-chip" key={s}>
                      {s}
                    </span>
                  )
                )}
              </div>
              <div className="strip-label">Languages, directed</div>
              <div className="skills-strip">
                {["Python", "JavaScript / TypeScript", "Dart", "SQL", "Bash"].map((s) => (
                  <span className="skill-chip" key={s}>
                    {s}
                  </span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={100} className="panel">
              <ul className="fact-list">
                <li><span className="k">Role</span><span className="v">Database Administrator</span></li>
                <li><span className="k">Focus</span><span className="v">Data &amp; trust layers</span></li>
                <li><span className="k">Studying</span><span className="v">BCA</span></li>
                <li><span className="k">Background</span><span className="v">Database Administration</span></li>
                <li><span className="k">Based in</span><span className="v">Kathmandu, Nepal</span></li>
              </ul>
            </Reveal>
          </div>
        </section>

        <SectionDivider />

        <section id="now">
          <Reveal className="section-head">
            <span className="section-num">Now</span>
            <ScrambleText className="section-title display" text="Off the Clock" />
          </Reveal>
          <div className="now-grid">
            <Reveal className="now-card now-card-media panel">
              <img
                className="now-render"
                src={katawareImg}
                alt="Rendered still of a procedural Blender recreation of the twilight kataware-doki scene from Kimi no Na wa"
                loading="lazy"
              />
              <div>
                <div className="now-tag">Blender</div>
                <h3>Kataware-Doki Scene</h3>
                <p>A procedural Blender recreation of the twilight "kataware-doki" location from <em>Kimi no Na wa</em>, built through direct scene work rather than off-the-shelf assets.</p>
              </div>
            </Reveal>
            <Reveal className="now-card panel" delay={80}>
              <div>
                <div className="now-tag">AI Generation</div>
                <h3>Pipelines &amp; Content</h3>
                <p>An ongoing interest in AI-generated content and video — ComfyUI, Wan2GP — and building automated pipelines around them outside of work hours.</p>
              </div>
            </Reveal>
            <Reveal className="now-card panel" delay={160}>
              <div>
                <div className="now-tag">Side Quests</div>
                <h3>Random Projects</h3>
                <p>A long tail of smaller builds and experiments — from a YouTube automation pipeline to odd one-off tools — some finished, some just proof a random idea worked.</p>
              </div>
            </Reveal>
          </div>
        </section>

        <SectionDivider />

        <section id="contact" className="contact">
          <Reveal>
            <div className="section-head" style={{ marginBottom: 26 }}>
              <span className="section-num">Contact</span>
            </div>
            <ScrambleText className="contact-title display" text="Let's talk shop." />
          </Reveal>
          <Reveal delay={80} className="open-to">
            Open to full-time roles and freelance projects.
          </Reveal>
          <Reveal delay={100} className="panel">
            <div className="contact-links">
              <a href="mailto:shadiqpoke@gmail.com">Email<BrushUnderline /></a>
              <a href="https://github.com/shadiqash" target="_blank" rel="noreferrer">GitHub<BrushUnderline /></a>
              <a href="https://www.linkedin.com/in/shadiq-shah-3944422b1/" target="_blank" rel="noreferrer">LinkedIn<BrushUnderline /></a>
              <a href="/resume.pdf" target="_blank" rel="noreferrer">Résumé<BrushUnderline /></a>
            </div>
          </Reveal>
          <div className="fine-print">
            <span>Shadiq — Kathmandu, Nepal</span>
            <span>Built with brush, type &amp; WebGL</span>
          </div>
        </section>
      </div>
    </div>
  );
}
