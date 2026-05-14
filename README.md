# APILens — Intelligent API Debugging Client

> Postman tells you *what* happened. APILens tells you *why* and *what to do next.*

---

## What Is This?

APILens is a developer tool that replaces Postman for API debugging workflows. It sits between you and any API, running every request and response through a three-layer analysis pipeline — instant validation, heuristic pattern detection, and AI-powered explanation — so engineers spend minutes debugging instead of hours.

**The core loop:**
```
You make an API request
        ↓
Layer 1: Instant validation (schema, headers, security rules)
        ↓
Layer 2: Heuristics (spec drift, latency anomalies, session patterns)
        ↓
Layer 3: AI triage — only on failure or explicit request
        ↓
Natural language explanation + concrete fix suggestion
```

---

## The Problem It Solves

A developer hits a `422 Unprocessable Entity`. Postman shows them the raw JSON error body. They spend 45 minutes reading docs, checking headers, guessing what field is wrong. APILens shows them: *"The `amount` field is missing the required `currency` sibling field. Your spec requires both when `payment_type` is `card`."* 

That's the difference.

---

## Target Users

- Enterprise engineering teams debugging internal microservices
- Developers integrating third-party APIs (Stripe, Twilio, OpenAI, etc.)
- Backend engineers who want spec-aware runtime validation without writing manual test scripts

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend                    │
│         (Request builder, Response viewer,           │
│          Analysis panel, Team knowledge base)        │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP
┌─────────────────────▼───────────────────────────────┐
│               Node.js / Express API                  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Layer 1    │  │   Layer 2    │  │  Layer 3   │  │
│  │  Validator  │→ │  Heuristics  │→ │  AI Triage │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐                  │
│  │  Proxy      │  │  Spec Parser │                  │
│  │  Engine     │  │  (OpenAPI)   │                  │
│  └─────────────┘  └──────────────┘                  │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
┌──────────▼──────┐  ┌────────▼────────┐
│   PostgreSQL    │  │      Redis      │
│                 │  │                 │
│ - collections   │  │ - session stats │
│ - environments  │  │ - latency data  │
│ - request hist  │  │ - rate limiting │
│ - team knowledge│  └─────────────────┘
└─────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Full stack in one repo, server components for fast loads |
| Backend | Node.js + Express | Familiar, fast to iterate, good HTTP proxy libraries |
| Database | PostgreSQL | Relational — collections, users, teams have real relationships |
| Cache / Session | Redis | Fast in-memory storage for per-session stats and latency tracking |
| AI | Anthropic Claude API | Best at code/API explanation tasks |
| Spec Parsing | `@apidevtools/swagger-parser` | Validates and dereferences OpenAPI specs |
| Schema Validation | `ajv` (JSON Schema) | Industry standard, fast, used in production at scale |
| ORM | Prisma | Type-safe DB queries, good migrations workflow |
| Auth | NextAuth.js | Handles sessions; later extend to OAuth/SAML for enterprise |
| Deployment | Vercel (frontend) + Railway (backend + DB) | Fast to ship, free tiers for MVP |

---

## Project Structure

```
apilens/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/         # Login, signup pages
│   │   │   ├── (dashboard)/    # Main app layout
│   │   │   │   ├── collections/
│   │   │   │   ├── request/    # Request builder + response viewer
│   │   │   │   └── knowledge/  # Team knowledge base
│   │   │   └── api/            # Next.js API routes (thin layer)
│   │   └── components/
│   │       ├── request-builder/
│   │       ├── response-viewer/
│   │       └── analysis-panel/ # Where Layer 1/2/3 results surface
│   │
│   └── api/                    # Node.js Express backend
│       ├── src/
│       │   ├── proxy/          # Core proxy engine
│       │   ├── layers/
│       │   │   ├── layer1-validator.ts
│       │   │   ├── layer2-heuristics.ts
│       │   │   └── layer3-ai.ts
│       │   ├── spec/           # OpenAPI spec loading + parsing
│       │   ├── session/        # Redis session management
│       │   └── routes/
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   └── shared/                 # Shared types between frontend and backend
│
└── docker-compose.yml          # Local Postgres + Redis
```

---

## Data Models

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  teamId      String?
  team        Team?    @relation(fields: [teamId], references: [id])
  collections Collection[]
  createdAt   DateTime @default(now())
}

model Team {
  id          String       @id @default(cuid())
  name        String
  members     User[]
  knowledge   KnowledgeEntry[]
}

model Collection {
  id        String    @id @default(cuid())
  name      String
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  requests  Request[]
  specUrl   String?   // OpenAPI spec for this collection
}

model Request {
  id           String   @id @default(cuid())
  collectionId String
  collection   Collection @relation(fields: [collectionId], references: [id])
  name         String
  method       String   // GET, POST, etc.
  url          String
  headers      Json
  body         Json?
  history      RequestHistory[]
}

model RequestHistory {
  id           String   @id @default(cuid())
  requestId    String
  request      Request  @relation(fields: [requestId], references: [id])
  // What was sent
  sentHeaders  Json
  sentBody     Json?
  // What came back
  statusCode   Int
  responseBody Json
  responseTime Int      // ms
  // Analysis results
  layer1Flags  Json?    // validation errors
  layer2Flags  Json?    // heuristic warnings
  layer3Result Json?    // AI explanation (cached)
  createdAt    DateTime @default(now())
}

model KnowledgeEntry {
  id          String   @id @default(cuid())
  teamId      String
  team        Team     @relation(fields: [teamId], references: [id])
  endpoint    String   // e.g. "POST /payments/charge"
  statusCode  Int
  explanation String   // AI-generated, stored for reuse
  fixSuggestion String
  createdBy   String
  hitCount    Int      @default(1)
  createdAt   DateTime @default(now())
}
```

---

## The Three Layers — Implementation Detail

### Layer 1: Validation (Synchronous, ~0ms)

Runs before the request is sent. Checks:

```typescript
// src/layers/layer1-validator.ts

export interface ValidationResult {
  passed: boolean
  flags: ValidationFlag[]
}

export interface ValidationFlag {
  severity: 'error' | 'warning'
  rule: string
  message: string
}

const rules = [
  validateSchema,        // Request body matches spec
  checkRequiredHeaders,  // e.g. Content-Type present
  blockInternalURLs,     // SSRF: block 127.0.0.1, 169.254.x.x, etc.
  detectContentTypeMismatch, // body is JSON but Content-Type is text/plain
]
```

### Layer 2: Heuristics (Synchronous, ~1ms)

Runs after response is received. Reads from Redis session stats:

```typescript
// src/layers/layer2-heuristics.ts

const heuristics = [
  matchKnownErrorPatterns,  // "Invalid API key" string → flag as auth issue
  compareToSpec,            // response shape vs OpenAPI spec
  detectLatencyAnomaly,     // compare to rolling average in Redis
  checkSessionPatterns,     // 3 consecutive 401s → token expiry pattern
]
```

### Layer 3: AI Triage (Async, ~2-5s, costs money)

Only triggered on 4xx/5xx OR explicit user click:

```typescript
// src/layers/layer3-ai.ts

export async function explainFailure(context: {
  request: RequestContext
  response: ResponseContext
  spec: OpenAPISpec | null
  sessionHistory: RequestHistory[]
  teamKnowledge: KnowledgeEntry[]
}): Promise<AIExplanation> {
  
  // 1. Check team knowledge cache first — free and instant
  const cached = await findMatchingKnowledge(context)
  if (cached) return cached

  // 2. Assemble prompt with full context
  const prompt = buildExplanationPrompt(context)

  // 3. Call AI
  const explanation = await callClaudeAPI(prompt)

  // 4. Store in team knowledge base for future reuse
  await saveToKnowledge(explanation, context)

  return explanation
}
```

---

## Build Roadmap — Learning-Oriented Phases

This roadmap is designed so each phase teaches you something real, not just adds features.

### Phase 0 — Foundation (Week 1)
**Goal:** Understand the project structure before writing features.

- [ ] Set up monorepo with `pnpm workspaces`
- [ ] Initialize Next.js frontend and Express backend
- [ ] Set up Docker Compose with Postgres + Redis locally
- [ ] Set up Prisma with initial schema (User, Collection, Request)
- [ ] Basic NextAuth login (email/password first, OAuth later)
- [ ] "Hello world" API proxy — forward a hardcoded request, return response

**What you learn:** Monorepo structure, containerized local dev, ORM migrations, basic auth flow.

---

### Phase 1 — Core Request Runner (Weeks 2–3)

**Milestone:** You can make API calls and save them. Functionally equivalent to basic Postman.

---

### Phase 2 — Layer 1 Validation (Week 4)
**Goal:** Add the first intelligence layer. Learn schema validation properly.

- [ ] OpenAPI spec loader (paste URL or upload file)
- [ ] Parse spec with `@apidevtools/swagger-parser`
- [ ] Validate request body against spec using `ajv` before sending
- [ ] Validate response body against spec after receiving
- [ ] SSRF protection (block private IP ranges)
- [ ] Content-Type mismatch detection
- [ ] Surface flags in UI with clear, non-scary explanations

**What you learn:** JSON Schema, OpenAPI spec structure, security rules (SSRF), runtime validation patterns.

**Milestone:** Load a Stripe OpenAPI spec. Make a malformed request. See it flagged before it even sends.

---

### Phase 3 — Layer 2 Heuristics (Weeks 5–6)
**Goal:** Add session memory and pattern detection. Learn Redis properly.

- [ ] Store rolling latency data per endpoint in Redis (sliding window)
- [ ] Flag when response time exceeds 2x the rolling average
- [ ] Pattern match response bodies for known error strings
- [ ] Detect consecutive auth failures (3x 401 → token expiry warning)
- [ ] Track and display response shape drift across history

**What you learn:** Redis data structures (sorted sets for time series), statistical rolling averages, session state management.

**Milestone:** Make 10 calls to an endpoint, artificially slow one down, see it flagged automatically.

---

### Phase 4 — Layer 3 AI Triage (Week 7)
**Goal:** Add AI explanation. Learn how to integrate LLMs in production responsibly.

- [ ] Wire up Anthropic Claude API
- [ ] Build context assembly function (request + response + spec + history)
- [ ] Implement cost gate — only trigger on 4xx/5xx or explicit click
- [ ] Display explanation + fix suggestion in UI
- [ ] Cache AI results in Postgres (same error = same explanation, no re-call)
- [ ] Show which layer triggered the explanation (validation / heuristic / AI)

**What you learn:** LLM API integration, prompt engineering, cost-aware architecture, response caching strategy.

**Milestone:** Hit a real 401. Click "Explain". Get a useful, accurate explanation with a concrete fix.

---

### Phase 5 — Team Knowledge Base (Weeks 8–9)
**Goal:** Build the enterprise differentiator. Learn multi-user data architecture.

- [ ] Team creation and invite flow
- [ ] When AI generates an explanation, save it to team knowledge base
- [ ] On any future matching error (same endpoint + status code), surface saved explanation first
- [ ] Knowledge base UI — browse all known issues per endpoint
- [ ] Hit count tracking — see which errors hit the team most

**What you learn:** Multi-tenant data design, search/matching logic, shared vs private data scoping.

**Milestone:** Two different users on the same team hit the same error. Second user gets instant explanation from knowledge base, no AI call.

---

### Phase 6 — Ship It (Week 10)
**Goal:** Get it in front of a real user.

- [ ] Deploy frontend to Vercel
- [ ] Deploy backend + DB to Railway
- [ ] Set up environment variables properly (no secrets in code)
- [ ] Basic error monitoring (Sentry)
- [ ] Write a one-paragraph pitch and post it somewhere developers hang out

**What you learn:** Production deployment, environment config, basic observability.

---

## Environment Variables

```bash
# .env.local (frontend)
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000

# .env (backend)
DATABASE_URL=postgresql://user:password@localhost:5432/apilens
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=
PORT=4000
```

---

## Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/apilens
cd apilens

# 2. Install dependencies
pnpm install

# 3. Start local services
docker-compose up -d

# 4. Set up database
cd apps/api
pnpm prisma migrate dev

# 5. Start both apps
pnpm dev
```

Frontend runs on `http://localhost:3000`
Backend runs on `http://localhost:4000`

---

## How to Not Vibe Code This

The temptation will be to generate everything and stitch it together. That produces a project you can't explain in an interview.

**Instead:**

**Understand before you copy.** Before using any library, read its README and understand what problem it solves. Before using `ajv`, understand what JSON Schema is. Before using Prisma, understand what an ORM is and why it exists.

**Build each layer to completion before moving on.** Phase 1 should work fully before Phase 2 starts. Don't have half-built features everywhere.

**Write the hard parts yourself first.** The SSRF detection, the latency rolling average, the context assembly for the AI prompt — write these from scratch before looking anything up. Even if your first version is wrong, you'll understand the solution when you find it.

**Read every error message fully.** Don't immediately Google the first line. Read the whole stack trace. Understand what file, what line, what the runtime was trying to do.

**Keep a build log.** A simple `DEVLOG.md` in the repo. One paragraph per day. What you built, what broke, what you learned. This becomes interview gold — you can speak to your process, not just your output.

---

## Testing Strategy

The rule is simple: test at the boundary of each layer. Don't mock the thing you're actually trying to verify.

### What to test and why

**Layer 1 — Unit tests (no network, no DB)**

Layer 1 is pure logic: take input, return flags. It's the easiest layer to test thoroughly and the most important to get right, because a missed SSRF rule or a broken schema check is a security or correctness bug.

```typescript
// apps/api/src/layers/__tests__/layer1-validator.test.ts

describe('SSRF blocking', () => {
  it('blocks loopback addresses', async () => {
    const result = await validateRequest({ url: 'http://127.0.0.1/admin' })
    expect(result.flags).toContainEqual(
      expect.objectContaining({ rule: 'block-internal-urls', severity: 'error' })
    )
  })

  it('blocks link-local addresses', async () => {
    const result = await validateRequest({ url: 'http://169.254.169.254/latest/meta-data' })
    expect(result.flags).toContainEqual(
      expect.objectContaining({ rule: 'block-internal-urls', severity: 'error' })
    )
  })

  it('allows legitimate external URLs', async () => {
    const result = await validateRequest({ url: 'https://api.stripe.com/v1/charges' })
    const ssrfFlags = result.flags.filter(f => f.rule === 'block-internal-urls')
    expect(ssrfFlags).toHaveLength(0)
  })
})

describe('schema validation', () => {
  it('flags a missing required field', async () => {
    // Stripe requires `amount` and `currency` together when payment_type is card
    const result = await validateRequest({
      url: 'https://api.stripe.com/v1/charges',
      body: { payment_type: 'card', amount: 1000 }, // missing currency
      spec: stripeOpenAPISpec,
    })
    expect(result.flags).toContainEqual(
      expect.objectContaining({ severity: 'error', rule: 'schema-validation' })
    )
  })

  it('passes a valid request body', async () => {
    const result = await validateRequest({
      url: 'https://api.stripe.com/v1/charges',
      body: { payment_type: 'card', amount: 1000, currency: 'usd' },
      spec: stripeOpenAPISpec,
    })
    expect(result.passed).toBe(true)
  })
})

describe('Content-Type mismatch', () => {
  it('flags JSON body with text/plain header', async () => {
    const result = await validateRequest({
      url: 'https://api.example.com/data',
      headers: { 'Content-Type': 'text/plain' },
      body: { key: 'value' },
    })
    expect(result.flags).toContainEqual(
      expect.objectContaining({ rule: 'content-type-mismatch' })
    )
  })
})
```

Write these tests *before* you implement the rules. A test that fails for the right reason is proof you understand the requirement.

**Layer 2 — Integration tests (real Redis, no network)**

Layer 2 reads session state from Redis. Don't mock Redis — use a real instance (your Docker Compose one, or `ioredis-mock` only as a last resort). The whole point is that the sliding window math and sorted set queries are correct.

```typescript
// apps/api/src/layers/__tests__/layer2-heuristics.test.ts

describe('latency anomaly detection', () => {
  beforeEach(async () => {
    await redis.flushdb() // start clean
  })

  it('flags a response that exceeds 2x the rolling average', async () => {
    // Seed 10 fast responses: ~100ms each
    for (let i = 0; i < 10; i++) {
      await recordLatency('GET /users', 100)
    }

    const result = await runHeuristics({
      endpoint: 'GET /users',
      responseTime: 350, // 3.5x the average
    })

    expect(result.flags).toContainEqual(
      expect.objectContaining({ rule: 'latency-anomaly' })
    )
  })

  it('does not flag normal variance', async () => {
    for (let i = 0; i < 10; i++) {
      await recordLatency('GET /users', 100)
    }

    const result = await runHeuristics({ endpoint: 'GET /users', responseTime: 180 })
    const latencyFlags = result.flags.filter(f => f.rule === 'latency-anomaly')
    expect(latencyFlags).toHaveLength(0)
  })
})

describe('consecutive auth failure detection', () => {
  it('warns after 3 consecutive 401s on the same endpoint', async () => {
    for (let i = 0; i < 3; i++) {
      await recordResponse('POST /payments', 401)
    }

    const result = await runHeuristics({ endpoint: 'POST /payments', statusCode: 401 })
    expect(result.flags).toContainEqual(
      expect.objectContaining({ rule: 'session-auth-pattern' })
    )
  })
})
```

**Layer 3 — Don't test the AI, test the wrapper**

You can't unit test what Claude returns. What you can test is everything around it:

- `buildExplanationPrompt()` — assert the assembled prompt contains the right context (request body, status code, spec excerpt, relevant history). This is a pure function; test it like one.
- `findMatchingKnowledge()` — assert cache hits work correctly so you're not burning API calls in tests.
- `saveToKnowledge()` — assert the result lands in the DB with the right fields.

Never call the real Anthropic API in tests. Use a stub that returns a fixed response.

```typescript
// Mock the API call, test everything around it
jest.mock('../callClaudeAPI', () => ({
  callClaudeAPI: jest.fn().mockResolvedValue({
    explanation: 'The currency field is required when payment_type is card.',
    fixSuggestion: 'Add "currency": "usd" to your request body.',
  }),
}))
```

**Proxy engine — Integration tests (real HTTP)**

The proxy is where edge cases hide: streaming bodies, hop-by-hop headers (`Connection`, `Transfer-Encoding`), chunked encoding. Use a local test HTTP server (e.g. with `nock` or a tiny Express app in your `beforeAll`) as the upstream target. Never proxy to a real external API in tests.

```typescript
describe('proxy engine', () => {
  let testServer: http.Server

  beforeAll(() => {
    testServer = createTestUpstream({ port: 9999 }) // returns canned responses
  })

  afterAll(() => testServer.close())

  it('forwards request headers to upstream', async () => { ... })
  it('strips hop-by-hop headers before forwarding', async () => { ... })
  it('returns the upstream status code unchanged', async () => { ... })
})
```

### Test file layout

```
apps/api/src/
├── layers/
│   ├── layer1-validator.ts
│   ├── layer2-heuristics.ts
│   ├── layer3-ai.ts
│   └── __tests__/
│       ├── layer1-validator.test.ts   ← unit, no I/O
│       ├── layer2-heuristics.test.ts  ← integration, real Redis
│       └── layer3-ai.test.ts          ← unit, stubbed API call
├── proxy/
│   └── __tests__/
│       └── proxy-engine.test.ts       ← integration, local test server
```

### The rule about what not to mock

Mock external paid APIs (Anthropic, Stripe). Don't mock your own infrastructure (Redis, Postgres). If you mock Redis to test Layer 2, you're testing your mock, not your rolling-average logic. Run Docker Compose locally; it costs nothing and catches real bugs.

---

## Key Libraries to Understand Deeply

Before using each of these, spend 30 minutes reading the docs — not tutorials, the actual docs:

- `@apidevtools/swagger-parser` — how it dereferences `$ref` pointers in OpenAPI specs
- `ajv` — what JSON Schema actually is, how `additionalProperties` works, how `$ref` resolution works
- `Prisma` — how migrations work, what the query engine does, how relations are modeled
- `ioredis` — Redis data types (string vs hash vs sorted set vs list) and when to use each
- `http-proxy-middleware` — how Node.js HTTP proxying works under the hood

---

## Resources

- [OpenAPI Specification](https://swagger.io/specification/) — read at least the Paths, Operations, and Schema sections
- [JSON Schema Understanding](https://json-schema.org/understanding-json-schema) — the validator (Layer 1) is built on this
- [Redis Data Types](https://redis.io/docs/data-types/) — essential before building Layer 2
- [Anthropic API Docs](https://docs.anthropic.com) — before building Layer 3
- [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — for Layer 1 security rules

---

## License

MIT
