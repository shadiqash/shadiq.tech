import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import katawareImg from "./assets/kataware.jpg";

/* ---------------------------------------------------------
   DESIGN NOTES (for Shadiq, not rendered)

   The background reads as a schema/query graph rather than
   abstract decoration — a nod to the actual work (databases,
   retrieval pipelines, "trust layers"):

   - ~20 nodes laid out on a jittered Fibonacci sphere, wired
     to their 2 nearest neighbours so the mesh reads as an
     organic ER-diagram rather than a perfect geometric shape.
     A few nodes are tinted rust as "hub" tables.
   - Small glowing sprites travel back and forth along each
     edge on a loop, standing in for a query moving across
     joins. Hovering a node speeds up the pulses on its edges.
   - Camera dollies backward and the graph rotates as you
     scroll — rotation encodes read progress, not decoration.
   - A soft particle field gives depth/grain; fast scrolling
     briefly swells the whole graph.
   - Pointer position adds gentle parallax to the whole scene.

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
function CommandPalette({ open, onClose, onNavigate, soundOn, onToggleSound, onShockwave }) {
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

/* Small radial-gradient sprite texture, generated once and shared across
   every node halo / pulse — cheaper than a canvas per sprite. */
let glowTexture = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/* ---------------- Three.js background ---------------- */
function ThreeBackground({ scrollRef, reducedMotion, onUnavailable, onSelectProject, activity, triggerRef }) {
  const mountRef = useRef(null);
  const shockwaveRef = useRef({ time: 100, x: 0, y: 0, active: false });
  const scrollVelocity = useRef(0);
  const lastScrollY = useRef(0);
  const activityRef = useRef(activity);
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (!isWebGLAvailable()) {
      onUnavailable?.();
      return;
    }

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
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.0, 289.0))) * 43758.5453); }
        void main() {
          vec2 uv = vUv;
          vec2 center = uv - 0.5;
          float dist = length(center);
          vec2 dir = dist > 0.0001 ? normalize(center) : vec2(0.0);
          float aberration = dist * 0.004;
          float r = texture2D(tDiffuse, uv - dir * aberration).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv + dir * aberration).b;
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

    // --- schema graph: nodes + edges + traveling "query" pulses ---
    const NODE_COUNT = 22;
    const HUB_COUNT = Math.min(PROJECTS.length, NODE_COUNT); // one hub per featured project

    // Fibonacci-sphere base layout, jittered so it reads as an organic
    // network rather than a perfect sphere.
    const nodePositions = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const y = 1 - (i / (NODE_COUNT - 1)) * 2;
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      const baseRadius = 2.3 + Math.random() * 0.9;
      const jitter = () => (Math.random() - 0.5) * 0.7;
      nodePositions.push(
        new THREE.Vector3(
          Math.cos(theta) * radiusAtY * baseRadius + jitter(),
          y * baseRadius * 0.9 + jitter(),
          Math.sin(theta) * radiusAtY * baseRadius + jitter() - 2
        )
      );
    }

    // Connect each node to its 2 nearest neighbours — gives a natural,
    // ER-diagram-like mesh instead of a fully-connected blob.
    const edgeSet = new Set();
    const edges = [];
    nodePositions.forEach((p, i) => {
      nodePositions
        .map((q, j) => (i === j ? null : { j, d: p.distanceTo(q) }))
        .filter(Boolean)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach(({ j }) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push([i, j]);
          }
        });
    });

    const graph = new THREE.Group();
    world.add(graph);

    const linePositions = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => {
      linePositions.set([nodePositions[a].x, nodePositions[a].y, nodePositions[a].z], i * 6);
      linePositions.set([nodePositions[b].x, nodePositions[b].y, nodePositions[b].z], i * 6 + 3);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: PAPER, transparent: true, opacity: 0.28 });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    graph.add(lines);

    // hubOrder is an ordered array (not just a Set) so each hub can carry
    // a stable index into PROJECTS — clicking a hub node navigates there.
    const hubOrder = [];
    while (hubOrder.length < HUB_COUNT) {
      const idx = Math.floor(Math.random() * NODE_COUNT);
      if (!hubOrder.includes(idx)) hubOrder.push(idx);
    }
    const hubIndices = new Set(hubOrder);
    const nodeGeo = new THREE.IcosahedronGeometry(0.065, 1);
    const nodes = nodePositions.map((pos, i) => {
      const isHub = hubIndices.has(i);
      const mat = new THREE.MeshBasicMaterial({
        color: isHub ? RUST : PAPER,
        transparent: true,
        opacity: isHub ? 0.9 : 0.7,
      });
      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(isHub ? 1.6 : 1);
      mesh.userData = {
        baseScale: isHub ? 1.6 : 1,
        baseOpacity: isHub ? 0.9 : 0.7,
        isHub,
        index: i,
        projectIndex: isHub ? hubOrder.indexOf(i) : -1,
      };

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color: isHub ? RUST : PAPER,
          transparent: true,
          opacity: isHub ? 0.5 : 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.setScalar(isHub ? 0.9 : 0.5);
      mesh.add(halo);
      mesh.userData.halo = halo;

      graph.add(mesh);
      return mesh;
    });

    // adjacency: which edges touch which node, so a hover can light up
    // the joins running through it
    const adjacency = nodes.map(() => []);
    edges.forEach(([a, b], i) => {
      adjacency[a].push(i);
      adjacency[b].push(i);
    });

    // traveling pulses: one glowing sprite per edge, looping start -> end
    const pulses = edges.map(([a, b]) => {
      const mat = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: RUST,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const dot = new THREE.Sprite(mat);
      dot.scale.setScalar(0.22);
      dot.userData = { a, b, phase: Math.random() };
      graph.add(dot);
      return dot;
    });

    // Floating HTML label that names a hub node's project on hover —
    // the affordance that tells you the graph is clickable, not just pretty.
    const nodeLabel = document.createElement("div");
    nodeLabel.className = "node-label";
    mount.appendChild(nodeLabel);

    // --- particle field ---
    const particleCount = 260;
    const positions = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const px = (Math.random() - 0.5) * 22;
      const py = (Math.random() - 0.5) * 15;
      const pz = (Math.random() - 0.5) * 32 - 6;
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      originalPositions[i * 3] = px;
      originalPositions[i * 3 + 1] = py;
      originalPositions[i * 3 + 2] = pz;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: PAPER,
      size: 0.022,
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

    // Drag rotates the graph manually; a plain click (no drag) fires the
    // shockwave and, if it lands on a hub node, navigates to its project.
    // Both are scoped to clicks that land on empty background (not real
    // content) so they never fight text selection or button/link clicks.
    function isBackgroundTarget(target) {
      return !target.closest(
        "a, button, input, p, h1, h2, h3, li, .panel, .now-card, .project, .skill-chip, .tag, .nav, .palette-scrim, .boot-loader"
      );
    }

    const manualRotation = { x: 0, y: 0 };
    let dragging = false;
    let dragIsBackground = false;
    let dragLast = null;
    let dragTotal = 0;

    function onPointerDown(e) {
      dragIsBackground = isBackgroundTarget(e.target);
      if (!dragIsBackground) return;
      e.preventDefault();
      dragging = true;
      dragLast = { x: e.clientX, y: e.clientY };
      dragTotal = 0;
    }
    function onPointerDrag(e) {
      if (!dragging || !dragLast) return;
      const dx = e.clientX - dragLast.x;
      const dy = e.clientY - dragLast.y;
      dragTotal += Math.abs(dx) + Math.abs(dy);
      manualRotation.y += dx * 0.003;
      manualRotation.x += dy * 0.003;
      dragLast = { x: e.clientX, y: e.clientY };
    }
    function onPointerUp(e) {
      const wasDrag = dragTotal > 6;
      const wasBackground = dragIsBackground;
      dragging = false;
      dragLast = null;
      if (wasDrag || !wasBackground) return;

      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;
      fireShockwave(nx, ny);

      raycaster.setFromCamera({ x: nx, y: ny }, camera);
      const hit = raycaster.intersectObjects(nodes)[0];
      if (hit && hit.object.userData.isHub && onSelectProject) {
        onSelectProject(hit.object.userData.projectIndex);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerDrag);
    window.addEventListener("pointerup", onPointerUp);

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
    const clock = new THREE.Clock();

    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const scroll = scrollRef.current || 0;
      const motion = reducedMotion ? 0.15 : 1;

      // Update raycaster for interactions
      raycaster.setFromCamera(pointer, camera);

      // Hover a node -> it grows/brightens and the joins running through
      // it (its edges' traveling pulses) speed up, like a query touching it.
      const nodeIntersects = reducedMotion ? [] : raycaster.intersectObjects(nodes);
      const hoveredNode = nodeIntersects.length > 0 ? nodeIntersects[0].object : null;
      const activeEdges = hoveredNode ? new Set(adjacency[hoveredNode.userData.index]) : null;

      nodes.forEach((n) => {
        const isHovered = n === hoveredNode;
        const targetScale = n.userData.baseScale * (isHovered ? 1.6 : 1);
        n.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);
        n.material.opacity = THREE.MathUtils.lerp(n.material.opacity, isHovered ? 1 : n.userData.baseOpacity, 0.1);
        n.userData.halo.material.opacity = THREE.MathUtils.lerp(
          n.userData.halo.material.opacity,
          isHovered ? 0.85 : n.userData.isHub ? 0.5 : 0.28,
          0.1
        );
      });

      // Fast scrolling briefly swells the whole graph, echoing a burst of
      // query activity rather than a static rotation.
      scrollVelocity.current *= 0.9;
      const velocityDistort = Math.min(Math.abs(scrollVelocity.current) * 0.003, 0.25);
      const targetGraphScale = 1 + velocityDistort;
      graph.scale.lerp(new THREE.Vector3(targetGraphScale, targetGraphScale, targetGraphScale), 0.08);

      graph.rotation.y = t * 0.05 * motion + scroll * Math.PI * 1.2;
      graph.rotation.x = t * 0.02 * motion + scroll * 0.5;

      // Real GitHub activity subtly speeds up every pulse — the graph is
      // meant to look busier when there's actually been recent commit activity.
      const activityBoost = 1 + (activityRef.current || 0) * 0.6;

      pulses.forEach((p, i) => {
        const boosted = activeEdges && activeEdges.has(i);
        p.userData.phase += 0.0035 * (boosted ? 2.4 : 1) * activityBoost * motion;
        if (p.userData.phase > 1) p.userData.phase -= 1;
        p.position.lerpVectors(nodePositions[p.userData.a], nodePositions[p.userData.b], p.userData.phase);
        p.material.opacity = THREE.MathUtils.lerp(p.material.opacity, boosted ? 0.95 : 0.55, 0.1);
      });

      // Hover label: names the project a hub node links to.
      if (hoveredNode && hoveredNode.userData.isHub) {
        const screenPos = hoveredNode.getWorldPosition(new THREE.Vector3()).project(camera);
        const lx = (screenPos.x * 0.5 + 0.5) * width;
        const ly = (-screenPos.y * 0.5 + 0.5) * height;
        const project = PROJECTS[hoveredNode.userData.projectIndex];
        nodeLabel.textContent = project ? project.title : "";
        nodeLabel.style.transform = `translate(${lx}px, ${ly - 26}px)`;
        nodeLabel.style.opacity = project ? "1" : "0";
      } else {
        nodeLabel.style.opacity = "0";
      }

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

      // Particle Repulsion Logic
      if (!reducedMotion && mousePos) {
          const localMousePos = mousePos.clone();
          world.worldToLocal(localMousePos);

          const particlePositions = particles.geometry.attributes.position.array;
          for (let i = 0; i < particleCount; i++) {
             const ix = i * 3;
             const iy = i * 3 + 1;
             const iz = i * 3 + 2;
             
             const ox = originalPositions[ix];
             const oy = originalPositions[iy];
             const oz = originalPositions[iz];
             
             const dx = ox - localMousePos.x;
             const dy = oy - localMousePos.y;
             const dz = oz - localMousePos.z;
             const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
             
             let tx = ox;
             let ty = oy;
             let tz = oz;

             const repulseRadius = 4.0;
             if (dist < repulseRadius && dist > 0) {
                 const force = (repulseRadius - dist) / repulseRadius;
                 tx = ox + (dx / dist) * force * 2.0;
                 ty = oy + (dy / dist) * force * 2.0;
                 tz = oz + (dz / dist) * force * 2.0;
             }

             // Shockwave effect
             if (shockwavePos) {
                 const sdx = tx - shockwavePos.x;
                 const sdy = ty - shockwavePos.y;
                 const sdz = tz - shockwavePos.z;
                 const sdist = Math.sqrt(sdx*sdx + sdy*sdy + sdz*sdz);
                 
                 const swRadius = shockwaveRef.current.time * 30.0; // ring expands fast
                 const swThickness = 3.0;
                 if (sdist > 0 && Math.abs(sdist - swRadius) < swThickness) {
                     const sforce = (1 - Math.abs(sdist - swRadius) / swThickness) * 8.0; 
                     tx += (sdx / sdist) * sforce;
                     ty += (sdy / sdist) * sforce;
                     tz += (sdz / sdist) * sforce;
                 }
             }

             particlePositions[ix] += (tx - particlePositions[ix]) * 0.1;
             particlePositions[iy] += (ty - particlePositions[iy]) * 0.1;
             particlePositions[iz] += (tz - particlePositions[iz]) * 0.1;
          }
          particles.geometry.attributes.position.needsUpdate = true;
      }

      world.rotation.y += (pointer.x * 0.15 + manualRotation.y - world.rotation.y) * 0.06;
      world.rotation.x += (pointer.y * 0.1 + manualRotation.x - world.rotation.x) * 0.06;

      const camPoint = cameraCurve.getPointAt(Math.min(Math.max(scroll, 0), 1));
      camera.position.copy(camPoint);
      camera.rotation.z = Math.sin(scroll * Math.PI) * 0.035 * motion;

      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      postMaterial.uniforms.uTime.value = t;
      renderer.render(postScene, postCamera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      if (triggerRef) triggerRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerDrag);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      if (nodeLabel.parentNode === mount) {
        mount.removeChild(nodeLabel);
      }
      lineGeo.dispose();
      lineMat.dispose();
      nodeGeo.dispose();
      nodes.forEach((n) => {
        n.material.dispose();
        n.userData.halo.material.dispose();
      });
      pulses.forEach((p) => p.material.dispose());
      particleGeo.dispose();
      particleMat.dispose();
      trailDots.forEach((d) => {
        d.geometry.dispose();
        d.material.dispose();
      });
      renderTarget.dispose();
      postMaterial.dispose();
      postQuad.geometry.dispose();
      renderer.dispose();
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
  const shockwaveTriggerRef = useRef(null);
  const githubActivity = useGithubActivity();
  const activity = Math.min((githubActivity || 0) / 8, 1);

  useAmbientDrone(soundOn, scrollRef);

  useEffect(() => {
    function onKey(e) {
      const typing = document.activeElement?.tagName === "INPUT";
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

        /* Node label (floating over the WebGL canvas) */
        .node-label {
          position: absolute; top: 0; left: 0; z-index: 5;
          padding: 5px 10px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase;
          color: var(--paper); background: rgba(11,11,10,0.85); border: 1px solid var(--rust);
          pointer-events: none; opacity: 0; transition: opacity 0.15s ease; white-space: nowrap;
        }

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
      <InkCursor />
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
      />

      {webglOK ? (
        <ThreeBackground
          scrollRef={scrollRef}
          reducedMotion={reducedMotion}
          onUnavailable={() => setWebglOK(false)}
          onSelectProject={(i) => scrollToSection(`project-${i}`)}
          activity={activity}
          triggerRef={shockwaveTriggerRef}
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
              <Reveal as="article" id={`project-${i}`} className="project-wrapper" delay={i * 60} key={p.title}>
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
