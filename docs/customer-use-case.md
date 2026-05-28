# Customer Use Case: AI Sales Co-Pilot

> **For:** Cloudflare Solutions Engineers selling to startups and enterprises
> **Value:** Reduce pre-call research from 45 minutes to 15 seconds. Get a full migration plan in under a minute.
> **Built on:** Cloudflare Workers, Workers AI, Vectorize, KV, D1
> **Live:** https://ai-sales-copilot.stephenmack96.workers.dev

---

## The Problem

As a Cloudflare Solutions Engineer, you have **15-20 customer calls per week**. For each call, you spend **30-60 minutes** on two things:

**1. Research** (30 min) — Who is this company? What do they do? What tech do they use? Any recent news?

**2. Architecture** (30 min) — They're on AWS Lambda, CloudFront, and S3. What's the Cloudflare equivalent? What's the migration path? What will they save?

**That's 15-20 hours per week.** Time you could spend building relationships, running demos, or closing deals.

---

## The Solution

Two AI agents that handle both workflows:

### Agent 1: Research — "Research Stripe"

Gathers real-time intelligence on any prospect in **~15 seconds**:

```
Before:
  9:00 AM — Open 6 Chrome tabs, read through each one
  9:45 AM — Compile notes in a Google Doc
  Time: 45 minutes

After:
  9:55 AM — "Research Stripe"
  9:55:15 — Structured profile returned:
    Company: Stripe
    Tech Stack: Ruby, AWS, CloudFront, Auth0
    Recent News: Launched Treasury API (2 weeks ago)
    Competitors: Adyen, Square, PayPal
    Cloudflare Opportunities:
      - Replace CloudFront with CDN + Cache
      - Add Bot Management for fraud prevention
      - D1 for global financial data
  Time: 15 seconds
```

**How it works:** Web search, website scraping, news API, then Workers AI synthesis into structured JSON. Falls back gracefully if any data source fails.

### Agent 2: Architecture — "They use Lambda, CloudFront, S3, RDS, and Cisco VPN"

Designs a complete Cloudflare migration plan in **~30-40 seconds**:

```json
{
  "component_mapping": [
    {"current": "AWS Lambda",        "cloudflare": "Workers",        "complexity": "moderate"},
    {"current": "AWS CloudFront",    "cloudflare": "CDN",            "complexity": "simple"},
    {"current": "AWS S3",            "cloudflare": "R2",             "complexity": "simple"},
    {"current": "AWS RDS",           "cloudflare": "D1",             "complexity": "complex"},
    {"current": "Cisco AnyConnect",  "cloudflare": "Access",         "complexity": "simple"}
  ],
  "migration_path": {
    "phase_1_quick_wins": ["CDN migration", "R2 for storage"],
    "phase_2_core": ["Workers for compute", "DDoS + WAF"],
    "phase_3_optimize": ["Tunnel + Magic WAN", "Access for Zero Trust"]
  },
  "cost_comparison": {
    "current_estimated_monthly": "$10,000 - $20,000",
    "target_estimated_monthly": "$5,000 - $10,000",
    "savings_percentage": "50-75%"
  },
  "gaps": ["No direct equivalent for relational databases at RDS scale"],
  "confidence": 0.8
}
```

**How it works:** Regex extracts every tech component from your message. Parallel Vectorize queries retrieve relevant Cloudflare product docs (80 chunks covering 20 products). Workers AI generates the architecture with real pricing data, migration phases, and honest gap analysis.

**Key detail:** Recommendations are grounded in actual product documentation, not hallucinations. The agent can only recommend products it has docs for.

---

## Why Cloudflare (Not OpenAI + Lambda)

This co-pilot is itself a proof point for the Cloudflare platform:

| Layer | What We Used | Why Not the Alternative |
|-------|-------------|----------------------|
| Compute | **Workers** | Lambda has 200-500ms cold starts. Workers: 0ms. |
| AI Inference | **Workers AI** (Llama 3 8B) | No API keys to manage, no egress costs, free on Paid plan |
| Vector Search | **Vectorize** (80 chunks, 768 dims) | Pinecone charges $70/mo for the same index size |
| Embeddings | **Workers AI** (BGE Base EN v1.5) | OpenAI Embeddings: $0.13/million tokens. Workers AI: free. |
| Session Memory | **KV** | DynamoDB: $1.25/million reads. KV: $0.50/million. |
| Audit Logs | **D1** | RDS: $50/mo minimum. D1: $0.001/million reads. |
| Secrets | **Wrangler Secrets** | No Vault, no SSM Parameter Store, no env files in repos |

**Total infrastructure cost: ~$5/month** for thousands of requests. The equivalent on AWS would be $50-200/month before you write a line of code.

---

## The Pitch to Customers

### For Startups (Seed to Series C)

> "Your team spends 2 hours per rep per day on pre-call research. That's 30 hours a week across 3 reps. This co-pilot does the same work in 15 seconds for $0.002 per call. Deploy it on Workers, same platform your app runs on."

**ROI math:**
- 3 reps x 2 hours/day x $75/hour = **$450/day saved**
- Co-pilot cost: **~$5/month**
- ROI: **90x**

### For Enterprises

> "500 calls a month across your SE team. Research quality varies by rep. Senior SEs prep well, junior ones wing it. This standardizes the output. Every rep gets the same depth of research. Every call has an architecture sketch before it starts. And you get an audit trail of what was researched, when, by whom."

**Enterprise value:**
- Consistent research quality = better calls = higher close rates
- Audit trail in D1 = compliance + coaching opportunities
- Architecture Agent = faster technical scoping, shorter sales cycles

---

## Competitive Positioning

| | AI Sales Co-Pilot | Manual Research | Apollo.io | ZoomInfo |
|---|:---:|:---:|:---:|:---:|
| **Research time** | 15s | 45 min | 5 min | 3 min |
| **Architecture design** | Built-in | Manual (30 min) | Not available | Not available |
| **Data freshness** | Real-time | Manual | Daily | Weekly |
| **Custom AI analysis** | Yes | No | No | No |
| **Cost per call** | $0.002 | $37.50 (labor) | $0.10 | $0.50 |
| **Runs on your infra** | Yes (Workers) | N/A | No (SaaS) | No (SaaS) |
| **Migration planning** | Automated | Manual | No | No |

**Key differentiator:** Apollo and ZoomInfo give you contact data. This gives you **technical intelligence** — what they're running, what to replace it with, what it'll cost, and what you'll save them.

---

## Live Demo

The co-pilot is deployed and running. Try it:

```bash
# Health check
curl https://ai-sales-copilot.stephenmack96.workers.dev/health

# Research a company
curl -X POST https://ai-sales-copilot.stephenmack96.workers.dev/api/v1/copilot \
  -H "Content-Type: application/json" \
  -d '{"session_id": "demo-001", "message": "Research Datadog"}'

# Design a migration
curl -X POST https://ai-sales-copilot.stephenmack96.workers.dev/api/v1/copilot \
  -H "Content-Type: application/json" \
  -d '{"session_id": "demo-002", "message": "Design architecture for a startup using Vercel, Supabase, and Auth0"}'
```

---

## Architecture Diagram

```
                    ┌───────────────┐
                    │  POST /copilot│
                    └───────┬───────┘
                            │
                ┌───────────▼───────────┐
                │     ORCHESTRATOR      │
                │                       │
                │  Keyword classify     │  ← Regex (0ms)
                │  LLM fallback         │  ← Workers AI (if ambiguous)
                │  Route to agent       │
                │  Store session → KV   │
                │  Log audit → D1       │
                └───┬───────────┬───────┘
                    │           │
          ┌─────────▼──┐  ┌────▼──────────┐
          │  Research   │  │ Architecture  │
          │   Agent     │  │    Agent      │
          │             │  │              │
          │ Web search  │  │ Regex extract │
          │ Scrape site │  │ Vectorize RAG │
          │ News API    │  │ Workers AI    │
          │ Workers AI  │  │ JSON output   │
          └─────────────┘  └───────────────┘
```

---

## Security and Compliance

- **No PII stored** — research is ephemeral, session history in KV auto-expires
- **Audit trail** — every agent run logged to D1 with session ID, agent name, input, output, latency
- **Secrets management** — API keys stored in Wrangler Secrets, never in code or env files
- **No external compute** — everything runs on Cloudflare, no data leaves the network
- **Rate limiting** — Cloudflare's built-in rate limiting protects the endpoint

---

## Setup (5 Minutes)

```bash
git clone https://github.com/sgmack96/ai-sales-copilot.git
cd ai-sales-copilot
npm install
wrangler secret put NEWS_API_KEY
npx wrangler deploy
curl -X POST https://your-worker.workers.dev/admin/seed  # Index product docs
```

---

*Built by a Cloudflare SE who got tired of opening 6 Chrome tabs before every call.*
