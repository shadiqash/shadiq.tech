import React, { useEffect, useRef, useState } from "react";

export default function ScrambleText({ text, className = "" }) {
  const [displayText, setDisplayText] = useState(text.replace(/./g, "_"));
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          obs.unobserve(el);
          let iteration = 0;
          const chars = '01!@#$%^&*()_+<>?[]{}';
          const interval = setInterval(() => {
            setDisplayText(
              text
                .split("")
                .map((letter, index) => {
                  if (index < iteration) return text[index];
                  if (text[index] === " ") return " ";
                  return chars[Math.floor(Math.random() * chars.length)];
                })
                .join("")
            );
            if (iteration >= text.length) clearInterval(interval);
            iteration += 1 / 3;
          }, 30);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [text]);

  return (
    <h2 ref={ref} className={className} aria-label={text}>
      {displayText}
    </h2>
  );
}
