import React, { useEffect, useRef, useState } from "react";

export default function SectionDivider() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="section-divider">
      <svg viewBox="0 0 800 4" preserveAspectRatio="none">
        <line
          className={`divider-line ${inView ? "drawn" : ""}`}
          x1="0"
          y1="2"
          x2="800"
          y2="2"
        />
      </svg>
    </div>
  );
}
