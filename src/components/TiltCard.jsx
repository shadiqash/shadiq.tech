import React, { useRef } from "react";
import { playThock } from "../audio/sfx";

export default function TiltCard({ children, className = "" }) {
  const ref = useRef(null);
  function onMove(e) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.transform = `perspective(800px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg) scale(1.02)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }
  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onMouseEnter={playThock}
      style={{ transition: "transform 0.2s ease" }}
    >
      {children}
    </div>
  );
}
