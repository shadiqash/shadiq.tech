export const NAV_LINKS = [
  { id: "work", label: "Work" },
  { id: "about", label: "About" },
  { id: "now", label: "Off the Clock" },
  { id: "contact", label: "Contact" },
];

export const PROJECTS = [
  {
    title: "Kukhra",
    tagline: "Inventory & POS for a poultry supply chain",
    body: "A Django/DRF backend tracking chicken from farm production through warehouses to 12 retail outlets — append-only stock ledgers instead of mutable balances, dated price rows so old orders keep their original price, and lot-level tracing for recalls. Built with a co-founder as a side project, not a client engagement.",
    tags: ["Django", "PostgreSQL", "Celery", "React"],
  },
  {
    title: "InfraWatch",
    tagline: "PostgreSQL control panel",
    body: "A 9-page control panel — Dashboard, Activity, Slow Queries, Table Health, Indexes, Replication, Permissions, Schema, NOC Report — built to replace a manual DataGrip / Termius workflow with one live view of the database. A lighter companion tool tracks schema drift the same way, deployed on a phone over Termux out of pure stubbornness.",
    tags: ["PostgreSQL", "Ops tooling", "SPA"],
  },
  {
    title: "Company Onboarding FAQ Bot",
    tagline: "RAG assistant for internal onboarding",
    body: "A retrieval-augmented onboarding assistant running on pgvector for storage, nomic-embed-text via Ollama for embeddings, and llama3.1:8b as the local model, with a GLM API toggle planned alongside a minimal frontend.",
    tags: ["RAG", "pgvector", "Ollama", "Llama 3.1"],
  },
  {
    title: "Spotit",
    tagline: "Cross-platform music, built fast",
    body: "A Flutter music app with local recommendation logic and YouTube audio streaming — a full Home screen with discovery shelves, Hive-backed downloads, YouTube Music / Spotify import, and mobile hardening via audio_service. Mobile kept as a separate codebase from desktop to ship faster.",
    tags: ["Flutter", "Hive", "audio_service"],
  },
];
