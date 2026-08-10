import React, { useRef } from "react";
import { playThock } from "../audio/sfx";

export default function MagneticLink({ children, href, className = "", onClick }) {
  const ref = useRef(null);
  function onMove(e) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) * 0.25;
    const dy = (e.clientY - cy) * 0.25;
    el.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function onLeave() {
    if (ref.current) ref.current.style.transform = "";
  }
  return (
    <a
      ref={ref}
      href={href}
      className={className}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onMouseEnter={playThock}
      style={{ transition: "transform 0.2s ease", display: "inline-block" }}
    >
      {children}
    </a>
  );
}
