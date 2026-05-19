# APILens — Web

Next.js 16 frontend for APILens. See the [root README](../../README.md) for full project setup, architecture, and environment variables.

## Development

```bash
# From the repo root (starts both api and web in parallel)
pnpm dev

# Or from this directory only
pnpm dev
```

Runs on http://localhost:3000. Requires the API server on port 4000.

## Stack

- **Next.js 16** with App Router and Turbopack
- **Tailwind CSS v4**
- **TypeScript**
- **Geist** font (via `next/font`)

## Key components

| Component | Purpose |
|---|---|
| `workspace/` | Root shell: header (3-zone navbar), sidebar, request builder area |
| `request-builder/` | URL bar, method, headers/auth/body tabs, send logic, result rendering |
| `response-viewer/` | JSON syntax highlighter, Layer 1/2/3 analysis cards |
| `sidebar/` | Collections — save and load named requests |
| `env-selector/` | Environment variable management with `{{interpolation}}` |
| `spec-selector/` | Load an OpenAPI 3.x spec by URL for schema validation |

## Environment

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```
