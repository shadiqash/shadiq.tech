import React, { useEffect, useState } from "react";

export default function HeroTitle({ text }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);
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
