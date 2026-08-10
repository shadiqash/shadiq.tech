# Shadiq — Portfolio

A personal portfolio site built with React, Three.js, and Vite. Features an interactive N-body gravity simulation, pilot mode with navigation beacons, a psql-styled command palette (⌘K), and scroll-driven camera animation.

## Stack

- **React 19** — UI composition
- **Three.js** — WebGL scene (lazy-loaded, code-split)
- **Vite 8** — build tooling
- **Web Audio API** — ambient drone + interaction SFX

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
src/
├── Portfolio3D.jsx          # Root composition component
├── components/              # UI components (InkCursor, TiltCard, CommandPalette, etc.)
├── data/                    # Content data (projects, nav links)
├── hooks/                   # Custom hooks (GitHub activity, ambient drone, fonts)
├── audio/                   # Web Audio SFX
└── styles/                  # CSS (design tokens + all component styles)
```

## Build

```bash
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # Run oxlint
```

## Features

- **N-body gravity simulation** — 260 particles with full O(n²) pairwise gravity
- **Pilot mode** — Free-flight through the scene with WASD controls and navigation beacons
- **Command palette** — psql-themed ⌘K interface for quick navigation
- **Scroll-driven camera** — Bézier flythrough path tied to scroll position
- **Post-processing** — Chromatic aberration, vignette, film grain, gravitational lensing
- **Live GitHub activity** — Commit count from the past 14 days
- **Ambient sound** — Opt-in drone that follows scroll position
- **Reduced motion** — Respects `prefers-reduced-motion`
