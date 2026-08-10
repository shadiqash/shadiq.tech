import React, { useEffect, useRef, useState } from "react";

const CHARS = "01!@#$%^&*()_+<>?[]{}";
const TICK_MS = 30;
// Total time the reveal is allowed to take, whatever the heading's length.
// The old version resolved a fixed number of characters per tick, so longer
// headings took proportionally longer — "LET'S TALK SHOP." sat as unreadable
// gibberish for three full seconds before a visitor could read it.
const REVEAL_MS = 850;

export default function ScrambleText({ text, className = "" }) {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const [displayText, setDisplayText] = useState(
    prefersReduced ? text : text.replace(/./g, "_")
  );
  const ref = useRef(null);

  useEffect(() => {
    // Scrambling type is exactly the kind of motion a reduced-motion request
    // is asking us not to do, and it withholds the content while it runs.
    if (prefersReduced) {
      setDisplayText(text);
      return;
    }

    const el = ref.current;
    if (!el) return;

    let interval = null;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.unobserve(el);
        const step = text.length / (REVEAL_MS / TICK_MS);
        let iteration = 0;
        interval = setInterval(() => {
          iteration += step;
          if (iteration >= text.length) {
            setDisplayText(text);
            clearInterval(interval);
            interval = null;
            return;
          }
          setDisplayText(
            text
              .split("")
              .map((letter, index) => {
                if (index < iteration) return text[index];
                if (letter === " ") return " ";
                return CHARS[Math.floor(Math.random() * CHARS.length)];
              })
              .join("")
          );
        }, TICK_MS);
      },
      { threshold: 0.1 }
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      // The old cleanup only disconnected the observer — a heading scrolled
      // past mid-reveal left its interval running and kept calling setState
      // on an unmounted component.
      if (interval) clearInterval(interval);
    };
  }, [text, prefersReduced]);

  return (
    <h2 ref={ref} className={className}>
      {/* The real text always stays in the accessibility tree, so assistive
          tech never sees the scrambled placeholder. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{displayText}</span>
    </h2>
  );
}
