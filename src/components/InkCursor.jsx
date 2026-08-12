import React, { useEffect, useRef } from "react";

const RUST = "122,43,34";
const PAPER = "244,241,232";
const LAUNCH_MS = 480;

export default function InkCursor({ pilotMode = false }) {
  const canvasRef = useRef(null);
  const pilotModeRef = useRef(pilotMode);
  useEffect(() => {
    pilotModeRef.current = pilotMode;
  }, [pilotMode]);

  useEffect(() => {
    /* Don't render on touch-primary devices */
    if (!window.matchMedia("(hover: hover)").matches) return;

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

    // Heading the ship's nose points at — smoothed so small jitters in the
    // raw pointer delta don't make it twitch, only real direction changes do.
    let heading = 0;

    /* Clicking PILOT launches the ship: it's the same nose that's been
       following the mouse the whole time, just accelerating away from the
       cursor and off the screen rather than a different graphic taking over. */
    let wasPiloting = false;
    let launchStart = -1;
    let launchOrigin = { x: 0, y: 0 };

    function drawShip(x, y, angle, scale, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-7, 6.5);
      ctx.lineTo(-3.5, 0);
      ctx.lineTo(-7, -6.5);
      ctx.closePath();
      ctx.fillStyle = `rgba(${RUST},${0.92 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${PAPER},${0.55 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    let raf;
    function tick() {
      raf = requestAnimationFrame(tick);
      const piloting = pilotModeRef.current;

      if (piloting && !wasPiloting) {
        launchStart = performance.now();
        launchOrigin = { x: chain[0].x, y: chain[0].y };
      }
      if (!piloting) launchStart = -1;
      wasPiloting = piloting;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (launchStart >= 0) {
        // Mid-launch: the ship rockets away from where it was clicked and
        // fades, handing off to the full-size ship the 3D scene reveals.
        const elapsed = performance.now() - launchStart;
        const p = Math.min(1, elapsed / LAUNCH_MS);
        if (p < 1) {
          const eased = p * p;
          const scale = 1 + eased * 9;
          const alpha = 1 - p;
          drawShip(launchOrigin.x, launchOrigin.y, heading, scale, alpha);
          if (!reduced) {
            const glow = ctx.createRadialGradient(
              launchOrigin.x, launchOrigin.y, 0,
              launchOrigin.x, launchOrigin.y, 18 + eased * 60
            );
            glow.addColorStop(0, `rgba(${PAPER},${0.5 * alpha})`);
            glow.addColorStop(1, `rgba(${RUST},0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(launchOrigin.x, launchOrigin.y, 18 + eased * 60, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        return;
      }

      const lead = reduced ? 1 : 0.5;
      const follow = reduced ? 1 : 0.42;
      const prevHeadX = chain[0].x;
      const prevHeadY = chain[0].y;
      chain[0].x += (target.x - chain[0].x) * lead;
      chain[0].y += (target.y - chain[0].y) * lead;
      for (let i = 1; i < POINTS; i++) {
        chain[i].x += (chain[i - 1].x - chain[i].x) * follow;
        chain[i].y += (chain[i - 1].y - chain[i].y) * follow;
      }

      const dx = chain[0].x - prevHeadX;
      const dy = chain[0].y - prevHeadY;
      if (dx * dx + dy * dy > 0.4) heading = Math.atan2(dy, dx);

      if (!reduced) {
        ctx.beginPath();
        ctx.moveTo(chain[1].x, chain[1].y);
        for (let i = 2; i < POINTS - 1; i++) {
          const mx = (chain[i].x + chain[i + 1].x) / 2;
          const my = (chain[i].y + chain[i + 1].y) / 2;
          ctx.quadraticCurveTo(chain[i].x, chain[i].y, mx, my);
        }
        const tail = chain[POINTS - 1];
        ctx.lineTo(tail.x, tail.y);
        ctx.strokeStyle = `rgba(${RUST},0.3)`;
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      drawShip(chain[0].x, chain[0].y, heading, 1, 1);
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
