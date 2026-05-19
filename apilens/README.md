# APILens

**Postman shows you the envelope. APILens shows you the X-ray.**

APILens is a developer-focused API debugging tool built around a three-layer analysis pipeline. Every request you send is validated, profiled against historical baselines, and triaged by AI — not as an afterthought, but as the primary output. The HTTP response is the final stage of that pipeline, not the main event.

Built for engineers who want to understand *why* an API behaves the way it does, not just *what* it returned.

---

## The pipeline

Every request passes through three layers before the response is shown:

**Layer 1 — Validation**
Static checks run before the request is forwarded: URL validity, SSRF protection (blocks private/loopback addresses), Content-Type consistency, JSON body validity, and OpenAPI schema validation if a spec is loaded. Errors here block the request entirely.

**Layer 2 — Heuristics**
Redis-backed session analysis runs after the response returns. Tracks a rolling latency baseline per endpoint, flags anomalies when response time exceeds 2× the average, detects auth failure streaks, and matches response body patterns (rate limiting, bad API keys, permission errors).

**Layer 3 — AI Triage**
Groq (`llama-3.3-70b-versatile`) generates a specific explanation and fix when a request fails (4xx/5xx). Results are cached by endpoint + status code so repeat failures are instant. Manual explain is available for any response via the Explain button.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React, Tailwind CSS v4, TypeScript |
| Backend | Express, TypeScript, Node.js |
| Database | PostgreSQL via Prisma ORM |
| Cache / heuristics | Redis (ioredis) |
| AI | Groq SDK — `llama-3.3-70b-versatile` |
| Monorepo | pnpm workspaces |
| Infrastructure | Docker Compose |

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for Postgres and Redis)
- A [Groq API key](https://console.groq.com) (free tier works)

---

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres and Redis
docker-compose up -d

# 3. Set up the database
cd apps/api
pnpm prisma migrate dev
cd ../..

# 4. Configure environment variables
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set GROQ_API_KEY

# 5. Start both services in parallel
pnpm dev
```

- Frontend: http://localhost:3000
- API: http://localhost:4000

---

## Environment variables

**`apps/api/.env`**

```env
DATABASE_URL=postgresql://apilens:apilens@localhost:5432/apilens?sslmode=disable
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=your_groq_api_key_here
PORT=4000
```

**`apps/web/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Project structure

```
apilens/
├── apps/
│   ├── api/                        # Express API server (port 4000)
│   │   ├── src/
│   │   │   ├── proxy/
│   │   │   │   ├── engine.ts       # Request forwarding (native fetch)
│   │   │   │   ├── validate.ts     # Layer 1: URL, SSRF, content-type checks
│   │   │   │   ├── heuristics.ts   # Layer 2: Redis-backed latency + auth analysis
│   │   │   │   └── ai.ts           # Layer 3: Groq AI triage + caching
│   │   │   ├── routes/
│   │   │   │   ├── proxy.ts        # POST /api/proxy/request, /explain
│   │   │   │   └── spec.ts         # POST /api/spec/load
│   │   │   ├── spec/
│   │   │   │   ├── loader.ts       # OpenAPI spec fetch + parse
│   │   │   │   └── validator.ts    # Request/response schema validation
│   │   │   ├── db.ts               # Prisma client
│   │   │   ├── redis.ts            # Redis client
│   │   │   └── index.ts            # Express app entry point
│   │   └── prisma/
│   │       └── schema.prisma       # requestHistory model
│   │
│   └── web/                        # Next.js frontend (port 3000)
│       ├── app/                    # App Router (login, workspace pages)
│       ├── components/
│       │   ├── workspace/          # Root layout: header + sidebar + builder
│       │   ├── request-builder/    # URL bar, method, headers, auth, body tabs
│       │   ├── response-viewer/    # JSON syntax highlighting, analysis cards
│       │   ├── sidebar/            # Collections: save and load requests
│       │   ├── env-selector/       # Environment variables with {{interpolation}}
│       │   └── spec-selector/      # OpenAPI spec loader by URL
│       └── hooks/
│           ├── use-collections.ts  # Collections state (localStorage)
│           ├── use-environments.ts # Environment state (localStorage)
│           └── use-spec.ts         # Active spec state
│
├── docker-compose.yml              # Postgres 16 + Redis 7
├── pnpm-workspace.yaml
└── package.json
```

---

## Features

- **Request builder** — method selector, URL bar with `{{variable}}` interpolation, headers editor with autocomplete, Bearer / Basic / API key auth, JSON body editor
- **Collections** — save requests to named collections, reload them with a click
- **Environments** — define named variable sets (dev, staging, prod) with color labels; variables interpolate into URLs and headers
- **OpenAPI spec validation** — load any public OpenAPI 3.x spec by URL; request and response bodies are validated automatically against the schema
- **JSON syntax highlighting** — keys (blue), strings (teal), numbers/booleans (amber), null (red); large payloads collapse with an expand toggle
- **Request history** — every request is persisted to Postgres with full flags and AI results
- **Dark mode** — full system-preference dark mode support
