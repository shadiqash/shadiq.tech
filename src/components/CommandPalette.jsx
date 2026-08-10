import React, { useEffect, useRef, useState } from "react";

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  soundOn,
  onToggleSound,
  onShockwave,
  pilotMode,
  onTogglePilot,
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const commands = [
    { id: "work", label: "Go to Work", hint: "\\c work", action: () => onNavigate("work") },
    { id: "about", label: "Go to About", hint: "\\c about", action: () => onNavigate("about") },
    { id: "now", label: "Go to Off the Clock", hint: "\\c now", action: () => onNavigate("now") },
    {
      id: "contact",
      label: "Go to Contact",
      hint: "\\c contact",
      action: () => onNavigate("contact"),
    },
    {
      id: "email",
      label: "Copy email address",
      hint: "shadiqpoke@gmail.com",
      action: () => navigator.clipboard?.writeText("shadiqpoke@gmail.com"),
    },
    {
      id: "github",
      label: "Open GitHub",
      hint: "github.com/shadiqash",
      action: () => window.open("https://github.com/shadiqash", "_blank", "noreferrer"),
    },
    {
      id: "linkedin",
      label: "Open LinkedIn",
      hint: "linkedin.com/in/shadiq-shah",
      action: () =>
        window.open(
          "https://www.linkedin.com/in/shadiq-shah-3944422b1/",
          "_blank",
          "noreferrer"
        ),
    },
    {
      id: "resume",
      label: "Download résumé",
      hint: "resume.pdf",
      action: () => window.open("/resume.pdf", "_blank", "noreferrer"),
    },
    {
      id: "sound",
      label: soundOn ? "Turn ambient sound off" : "Turn ambient sound on",
      hint: "toggle audio",
      action: onToggleSound,
    },
    {
      id: "pilot",
      label: pilotMode ? "Exit pilot mode" : "Enter pilot mode",
      hint: pilotMode ? "esc" : "fly through the gravity sim",
      action: onTogglePilot,
    },
    {
      id: "diagnostic",
      label: "Run diagnostic",
      hint: "select pg_sleep(0); -- shockwave",
      action: onShockwave,
    },
  ];

  const filtered = commands.filter((c) =>
    (c.label + " " + c.hint).toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  if (!open) return null;

  function run(cmd) {
    cmd?.action?.();
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(filtered[selected]);
    }
  }

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div
        className="palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="palette-prompt">
          <span className="palette-sigil">shadiq=#</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search commands..."
            aria-label="Command search"
          />
        </div>
        <div className="palette-list" role="listbox" aria-label="Available commands">
          {filtered.length === 0 && (
            <div className="palette-empty">no matching command</div>
          )}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              role="option"
              aria-selected={i === selected}
              className={`palette-item ${i === selected ? "active" : ""}`}
              onMouseEnter={() => setSelected(i)}
              onClick={() => run(c)}
            >
              <span>{c.label}</span>
              <span className="palette-hint">{c.hint}</span>
            </div>
          ))}
        </div>
        <div className="palette-foot">↑↓ navigate · ↵ run · esc close</div>
      </div>
    </div>
  );
}
