import React, { useEffect, useRef } from "react";

export default function InkCursor() {
  const canvasRef = useRef(null);
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
