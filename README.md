# AI Technical Sales Co-Pilot

> **Status:** Foundation phase — architecture & theory  
> **Goal:** Production-grade multi-agent system that automates the SE workflow from research to call notes  
> **Built on:** Cloudflare Workers, Workers AI, AI Gateway, Vectorize, D1

---

## The Pitch

An AI system that acts as a Solutions Engineer co-pilot. It researches prospects, designs architectures, generates business cases, and structures call notes — all deployed on Cloudflare's edge with sub-100ms latency.

**Why this matters:** Every AI company (Anthropic, OpenAI) needs people who can build *and* sell AI. This project proves both.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (API / Chat UI)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              ORCHESTRATOR (Hono + Workers)                  │
│  - Intent classification                                    │
│  - Agent routing                                            │
│  - Conversation memory (KV)                                 │
│  - Audit logging (D1)                                       │
└────┬────┬────┬────┬─────────────────────────────────────────┘
     │    │    │    │
     ▼    ▼    ▼    ▼
┌────────┐ ┌──────────┐ ┌────────────┐ ┌─────────────┐
│Research│ │Architect │ │  Business  │ │   Notes     │
│ Agent  │ │  Agent   │ │   Agent    │ │   Agent     │
└────┬───┘ └────┬─────┘ └─────┬──────┘ └──────┬──────┘
     │          │             │               │
     ▼          ▼             ▼               ▼
┌──────────────────────────────────────────────────────┐
│                    TOOL LAYER                        │
│  - Web scraping (BrightData / Puppeteer)             │
│  - News API                                          │
│  - Crunchbase / LinkedIn                             │
│  - Cloudflare product docs (Vectorize RAG)           │
│  - Architecture diagram generation (Mermaid/ASCII)   │
│  - Salesforce / HubSpot API                          │
└──────────────────────────────────────────────────────┘
```

---

## Agent Breakdown

| Agent | What It Does | Tools | Output |
|-------|-------------|-------|--------|
| **Research Agent** | Scrapes web, news, Crunchbase to build a company profile | Web scraper, News API, LinkedIn | Structured JSON profile |
| **Architecture Agent** | Designs current vs target architecture | RAG (internal docs), diagram generator | Mermaid diagram + migration plan |
| **Business Case Agent** | Generates ROI, cost comparison, risk analysis | Pricing APIs, benchmark data | Markdown business case |
| **Security Agent** | Maps compliance needs to Cloudflare products | Compliance frameworks DB | Security gap analysis |
| **Notes Agent** | Structures call notes into Salesforce format | CRM API | Formatted opportunity notes |

---

## Project Structure

```
ai-sales-copilot/
├── src/
│   ├── index.ts              # Hono entry point
│   ├── orchestrator.ts       # Intent classification + routing
│   ├── agents/
│   │   ├── research.ts
│   │   ├── architect.ts
│   │   ├── business-case.ts
│   │   ├── security.ts
│   │   └── notes.ts
│   ├── tools/
│   │   ├── web-scraper.ts
│   │   ├── news-api.ts
│   │   ├── diagram-gen.ts
│   │   └── vectorize-rag.ts
│   ├── memory/
│   │   └── kv-store.ts
│   └── types/
│       └── index.ts
├── notes/                    # Theory, checkpoints, decisions
│   ├── 01-theory-multi-agent-systems.md
│   ├── 02-architecture-overview.md
│   └── checkpoint-*.md
├── tests/
├── docs/
│   └── api-reference.md
├── wrangler.toml
├── package.json
└── README.md
```

---

## Current Phase

**Phase 1: Foundation** — Reading theory, designing architecture, building the orchestrator.

See `notes/` for theory and checkpoint reviews.

---

*Built for the edge. Built for the job.*
