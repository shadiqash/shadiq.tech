import React, { useEffect, useRef, useState } from "react";
import katawareImg from "./assets/kataware.jpg";

/* --- data & hooks --- */
import { NAV_LINKS, PROJECTS } from "./data/projects";
import useGithubActivity from "./hooks/useGithubActivity";
import useAmbientDrone from "./hooks/useAmbientDrone";

/* --- components --- */
import InkCursor from "./components/InkCursor";
import HeroTitle from "./components/HeroTitle";
import TiltCard from "./components/TiltCard";
import MagneticLink from "./components/MagneticLink";
import SectionDivider from "./components/SectionDivider";
import BootLoader from "./components/BootLoader";
import ScrambleText from "./components/ScrambleText";
import Reveal from "./components/Reveal";
import BrushUnderline from "./components/BrushUnderline";
import CommandPalette from "./components/CommandPalette";
import GithubPulse from "./components/GithubPulse";
import ThreeBackground from "./components/ThreeBackground";

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.location.hash = id;
  }
}

export default function Portfolio3D() {
  const [navOpen, setNavOpen] = useState(false);
  const scrollRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webglOK, setWebglOK] = useState(true);
  const [activeSection, setActiveSection] = useState("work");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [pilotMode, setPilotMode] = useState(false);
  const [secretFound, setSecretFound] = useState(false);
  const shockwaveTriggerRef = useRef(null);
  // Which flight controls to describe in the pilot hint. Read once — a
  // device doesn't grow a mouse mid-session, and matchMedia in render would
  // otherwise be re-evaluated on every state change.
  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window)
  );
  const githubActivity = useGithubActivity();
  const activity = Math.min((githubActivity || 0) / 8, 1);

  useAmbientDrone(soundOn, scrollRef);

  /* Pilot mode pauses normal page scrolling */
  useEffect(() => {
    document.body.style.overflow = pilotMode ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [pilotMode]);

  /* Pointer Lock: turns steering from "hold the mouse exactly at the
     screen's center" (genuinely hard — the old absolute-position scheme)
     into standard FPS-style mouse-look, where only movement matters and
     there's no correct place to rest the cursor. Request must happen
     inside the same synchronous click handler that toggles pilot mode on
     (browsers require a user gesture); exit is safe to call anytime. */
  function togglePilotMode() {
    // Deliberately not a setState updater function: React StrictMode
    // double-invokes those in development to check for purity, which would
    // fire requestPointerLock/exitPointerLock twice per click and toggle
    // the lock straight back off. Reading `pilotMode` from render scope and
    // passing setPilotMode a plain value keeps the side effect to one call.
    const next = !pilotMode;
    try {
      if (next) {
        // Some Chromium versions return a Promise here; others don't.
        // Either way, a failed lock is never fatal — steering just falls
        // back to the older position-based scheme — so swallow it rather
        // than letting an unhandled rejection hit the console (rapid
        // toggling can legitimately trigger a WrongDocumentError).
        document.body.requestPointerLock?.()?.catch?.(() => {});
      } else if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch {
      // Synchronous throw path — same reasoning as above.
    }
    setPilotMode(next);
  }
  useEffect(() => {
    function onLockChange() {
      // The browser can drop pointer lock on its own (Escape, alt-tab,
      // switching windows) — keep React's state in sync either way.
      if (!document.pointerLockElement && pilotMode) setPilotMode(false);
    }
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, [pilotMode]);

  /* ⌘K / Escape keyboard shortcuts */
  useEffect(() => {
    function onKey(e) {
      const typing = document.activeElement?.tagName === "INPUT";
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (secretFound) setSecretFound(false);
        else if (pilotMode) setPilotMode(false);
        else setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pilotMode, secretFound]);

  /* Reduced motion + scroll tracking */
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

  /* Active section tracking via IntersectionObserver */
  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.id);
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="page">
      <BootLoader />
      {!pilotMode && <InkCursor />}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(id) => { setPaletteOpen(false); scrollToSection(id); }}
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
        onShockwave={() => shockwaveTriggerRef.current?.(0, 0)}
        pilotMode={pilotMode}
        onTogglePilot={() => { setPaletteOpen(false); togglePilotMode(); }}
      />

      {pilotMode && (
        <div className="pilot-hud" aria-hidden="true">
          <div className="pilot-hint">
            {isTouch
              ? "PILOT MODE — hold THRUST to fly · drag anywhere to steer · ▲▼ for up-down · fly into a glowing marker to dock · dive into the core for something else"
              : "PILOT MODE — WASD / arrows to move · space / shift for up-down · mouse to steer · fly into a glowing marker to dock · dive into the core for something else · esc to exit"}
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
            if (document.pointerLockElement) document.exitPointerLock();
            setPilotMode(false);
            scrollToSection(id);
          }}
          onSecretFound={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            setPilotMode(false);
            setSecretFound(true);
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

      {secretFound && (
        <div className="palette-scrim" onClick={() => setSecretFound(false)}>
          <div className="secret-modal" onClick={(e) => e.stopPropagation()}>
            <div className="secret-sigil">shadiq=# SELECT * FROM secrets WHERE found = true;</div>
            <p className="secret-body">
              No foreign key points here — this marker isn't linked from any nav bar, README, or
              sitemap. You found it by flying into empty space on a hunch, which is a pretty good
              instinct for debugging distributed systems too.
            </p>
            <p className="secret-body ash">
              If that's the kind of curiosity you'd bring to a team: shadiqpoke@gmail.com.
            </p>
            <div className="secret-foot">ROWS AFFECTED: 1 · esc to close</div>
          </div>
        </div>
      )}

      <div className="content">
        {/* Skip-to-content for keyboard/screen-reader users */}
        <a href="#work" className="sr-only">Skip to content</a>

        <nav className="nav">
          <div className="nav-left">
            <span className="nav-mark">SHADIQ /</span>
            <button
              className="nav-util"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command menu"
              title="Command menu — jump to a section, copy my email, grab my résumé"
            >
              ⌘K
            </button>
            <button
              className="nav-util"
              onClick={() => setSoundOn((v) => !v)}
              aria-pressed={soundOn}
              aria-label="Toggle ambient sound"
              title="Ambient soundtrack"
            >
              {soundOn ? "SND ON" : "SND OFF"}
            </button>
            {webglOK && (
              <button
                className="nav-util nav-util-pilot"
                onClick={togglePilotMode}
                aria-pressed={pilotMode}
                aria-label="Toggle pilot mode"
                title={
                  pilotMode
                    ? "Leave the ship and go back to scrolling"
                    : "Fly a ship through the background — WASD to move, mouse to steer, dock at a marker to jump to a section"
                }
              >
                {pilotMode ? "EXIT SHIP" : "PILOT"}
              </button>
            )}
          </div>
          <button
            className="nav-toggle"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label="Toggle navigation menu"
          >
            {navOpen ? "Close" : "Menu"}
          </button>
          <div className={`nav-links ${navOpen ? "open" : ""}`}>
            {NAV_LINKS.map((l) => (
              <MagneticLink
                key={l.id}
                href={`#${l.id}`}
                className={`nav-link ${activeSection === l.id ? "active" : ""}`}
                onClick={(e) => { e.preventDefault(); setNavOpen(false); scrollToSection(l.id); }}
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
                      <span className="tag" key={t}>{t}</span>
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
                {["PostgreSQL", "FastAPI", "pgvector", "Ollama / Llama", "Flutter"].map((s) => (
                  <span className="skill-chip" key={s}>{s}</span>
                ))}
              </div>
              <div className="strip-label">Languages, directed</div>
              <div className="skills-strip">
                {["Python", "JavaScript / TypeScript", "Dart", "SQL", "Bash"].map((s) => (
                  <span className="skill-chip" key={s}>{s}</span>
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
