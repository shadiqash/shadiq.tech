import React, { useEffect, useState } from "react";

export default function BootLoader() {
  const [booting, setBooting] = useState(true);
  const [text, setText] = useState("");

  useEffect(() => {
    /* Skip on return visits within the same session */
    if (sessionStorage.getItem("portfolio-booted")) {
      setBooting(false);
      return;
    }

    const msgs = ["INITIALIZING SYNC...", "LOADING TRUST LAYERS...", "SYSTEM READY."];
    let i = 0;
    const interval = setInterval(() => {
      setText(msgs[i]);
      i++;
      if (i >= msgs.length) {
        clearInterval(interval);
        setTimeout(() => {
          setBooting(false);
          sessionStorage.setItem("portfolio-booted", "1");
        }, 500);
      }
    }, 400);

    function dismiss() {
      clearInterval(interval);
      setBooting(false);
      sessionStorage.setItem("portfolio-booted", "1");
    }
    window.addEventListener("click", dismiss, { once: true });
    window.addEventListener("keydown", dismiss, { once: true });

    return () => {
      clearInterval(interval);
      window.removeEventListener("click", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, []);

  if (!booting) return null;
  return (
    <div className="boot-loader" role="status" aria-live="polite">
      <div className="boot-text">
        {text}<span className="boot-cursor">_</span>
      </div>
    </div>
  );
}
