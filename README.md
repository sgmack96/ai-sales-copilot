# AI Technical Sales Co-Pilot

> **Status:** Live in production  
> **Live URL:** https://ai-sales-copilot.stephenmack96.workers.dev  
> **Built on:** Cloudflare Workers, Workers AI, Vectorize, KV, D1

An AI-powered co-pilot for Solutions Engineers. Describe a prospect's tech stack in plain English — get back a structured company profile, Cloudflare migration plan, component mapping, cost comparison, and migration phases. All running on Cloudflare's edge.

---

## What It Does

### Research Agent — "Research Stripe"

Gathers real-time intelligence on any prospect company:
- Searches the web for their homepage, careers page, engineering blog
- Scrapes their website for tech stack signals
- Fetches recent news (funding, launches, incidents)
- Synthesizes everything into a structured JSON profile with Cloudflare opportunities

**Time:** ~10-15 seconds. Replaces 30-60 minutes of manual pre-call research.

### Architecture Agent — "They use Lambda, CloudFront, S3, RDS, and Cisco VPN"

Designs a full Cloudflare-native target architecture:
- Extracts every technology component from your message automatically
- Queries a 80-chunk Vectorize knowledge base of Cloudflare product docs (overview, comparison, pricing, use-case for 20 products)
- Maps each component to its Cloudflare equivalent with migration complexity
- Generates a 3-phase migration path (quick wins, core, optimize)
- Estimates cost savings with real pricing data
- Flags gaps honestly where Cloudflare has no equivalent

**Time:** ~25-40 seconds for 3-5 components. Returns structured JSON.

---

## Architecture

```
                    ┌───────────────┐
                    │  POST /copilot│
                    └───────┬───────┘
                            │
                ┌───────────▼───────────┐
                │     ORCHESTRATOR      │
                │                       │
                │  1. Keyword classify   │  ← Regex patterns (0ms)
                │  2. LLM fallback      │  ← Workers AI (5-10s, only if ambiguous)
                │  3. Route to agent    │
                │  4. Store session     │  → KV (fire-and-forget)
                │  5. Log audit         │  → D1 (fire-and-forget)
                └───┬───────────┬───────┘
                    │           │
          ┌─────────▼──┐  ┌────▼──────────┐
          │  Research   │  │ Architecture  │
          │   Agent     │  │    Agent      │
          └──────┬──────┘  └──────┬────────┘
                 │                │
          ┌──────▼──────┐  ┌─────▼─────────┐
          │ Web Search  │  │  Vectorize    │
          │ Web Scraper │  │  RAG (80      │
          │ News API    │  │  product      │
          │ Fallback AI │  │  chunks)      │
          └─────────────┘  └───────────────┘
```

**Every box runs on Cloudflare.** No external compute. Workers AI for inference, Vectorize for RAG, KV for sessions, D1 for audit logs.

---

## Live Endpoints

| Method | Path | What It Does |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns version, active agents |
| `POST` | `/api/v1/copilot` | Main endpoint — send a message, get agent output |
| `GET` | `/session/:id` | Retrieve conversation history for a session |
| `POST` | `/admin/seed` | Re-seed Vectorize index with product docs |
| `GET` | `/admin/seed/status` | Verify Vectorize index is live |

### Quick Test

```bash
# Research a company
curl -X POST https://ai-sales-copilot.stephenmack96.workers.dev/api/v1/copilot \
  -H "Content-Type: application/json" \
  -d '{"session_id": "demo-001", "message": "Research Stripe"}'

# Design an architecture
curl -X POST https://ai-sales-copilot.stephenmack96.workers.dev/api/v1/copilot \
  -H "Content-Type: application/json" \
  -d '{"session_id": "demo-002", "message": "Design architecture for a startup using AWS Lambda, CloudFront, S3, and Auth0"}'
```

---

## Tech Stack

| Layer | Technology | Cloudflare Product |
|-------|-----------|-------------------|
| Compute | TypeScript + Hono framework | **Workers** (V8 isolates, 0ms cold start) |
| AI Inference | Llama 3 8B Instruct | **Workers AI** (free on Paid plan) |
| Embeddings | BGE Base EN v1.5 (768 dims) | **Workers AI** |
| Vector Search | 80 product chunks, cosine similarity | **Vectorize** |
| Session Memory | Conversation history per session | **KV** (global replication) |
| Audit Logs | Every agent run with latency tracking | **D1** (SQLite at the edge) |
| Secrets | API keys for News API, etc. | **Wrangler Secrets** |

---

## Vectorize Knowledge Base

The Architecture Agent is grounded in real product documentation, not hallucinations. We wrote and indexed 80 chunks covering 20 Cloudflare products:

| Category | Products |
|----------|----------|
| Compute | Workers, Workers AI |
| Storage | R2, KV, D1 |
| Network | CDN, Argo, Spectrum, Magic Transit, Magic WAN |
| Security | WAF, DDoS Protection, Bot Management, API Shield, Access, Gateway, Tunnel |
| AI | AI Gateway, Vectorize |

Each product has 4 chunk types:
- **Overview** — what it is, key features, enterprise tier differences
- **Comparison** — vs specific competitors (AWS, Azure, GCP, Vercel, Akamai, etc.)
- **Pricing** — free tier, paid tier, enterprise tier with real dollar amounts
- **Use Case** — startup and enterprise scenarios with Cloudflare positioning

---

## Performance

The orchestrator was optimized to minimize latency within Workers AI model speed constraints:

| Optimization | Impact |
|-------------|--------|
| Keyword pre-classifier (regex) | Skips LLM intent classification for obvious patterns. Saves 5-10s. |
| Regex component extraction | Extracts tech stack via keyword map instead of LLM call. Saves 5-10s. |
| Parallel Vectorize queries | `Promise.all` across all components simultaneously. ~1-3s total. |
| Chunk cap (10 max) | Keeps prompt under ~4000 tokens for faster generation. |
| Fire-and-forget storage | KV + D1 writes don't block the response (`Promise.allSettled`). |

**Measured latency:**

| Query | Components | Latency |
|-------|-----------|---------|
| "What replaces AWS Lambda?" | 1 | ~24s |
| Vercel + Supabase + Auth0 | 3 | ~36s |
| Lambda + CloudFront + S3 + RDS + VPN | 5 | ~42s |

Latency is dominated by Workers AI (Llama 3 8B) generation time, not our code. Switching to a faster model via AI Gateway would cut this to 3-8s.

---

## Project Structure

```
ai-sales-copilot/
├── src/
│   ├── index.ts              # Hono entry point + admin routes
│   ├── orchestrator.ts       # Intent classification + agent routing
│   ├── seed.ts               # Vectorize batch embedding + upsert
│   ├── agents/
│   │   ├── research.ts       # Phase 1: Web search + scraping + news
│   │   └── architecture.ts   # Phase 2: Vectorize RAG + migration design
│   ├── data/
│   │   └── cloudflare-docs.ts # 80 product chunks (20 products x 4 types)
│   ├── tools/
│   │   ├── web-search.ts     # DuckDuckGo search
│   │   ├── web-scraper.ts    # HTML scraping + text extraction
│   │   └── news-api.ts       # NewsAPI integration
│   └── types/
│       └── index.ts          # Core types (Agent, Tool, Env, Intent)
├── docs/
│   └── customer-use-case.md  # Customer-facing pitch document
├── notes/                    # Design notes + learning workbooks
├── tests/
├── wrangler.toml             # Workers config (KV, D1, Vectorize, AI bindings)
├── schema.sql                # D1 audit table schema
└── package.json
```

---

## What's Next

| Phase | Agent | Status |
|-------|-------|--------|
| Phase 1 | Research Agent | Shipped |
| Phase 2 | Architecture Agent + Vectorize RAG | Shipped |
| Phase 3 | Business Case Agent (ROI, competitive positioning) | Planned |
| Phase 4 | Multi-agent chaining (Research -> Architecture -> Business Case) | Planned |
| Phase 5 | Chat UI + Slack integration | Planned |

---

## Setup

```bash
# Clone
git clone https://github.com/sgmack96/ai-sales-copilot.git
cd ai-sales-copilot

# Install
npm install

# Set secrets
wrangler secret put NEWS_API_KEY

# Deploy
npx wrangler deploy

# Seed Vectorize index (run once after deploy)
curl -X POST https://your-worker.workers.dev/admin/seed
```

---

## License

MIT

---

*Built by a Cloudflare SE who got tired of spending 45 minutes researching every prospect.*
