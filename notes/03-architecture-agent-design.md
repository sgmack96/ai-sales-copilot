# Architecture Agent Design

> **Date:** 2026-05-26  
> **Status:** Design Phase → Implementation  
> **Dependencies:** Vectorize index with Cloudflare product docs

---

## What It Does

Takes a company's current tech stack and designs a Cloudflare-native architecture.

**Input:**
```json
{
  "company_name": "Stripe",
  "current_stack": ["AWS Lambda", "CloudFront", "Auth0", "RDS"],
  "use_case": "fintech payments"
}
```

**Output:**
```json
{
  "current_architecture": {
    "description": "AWS-based monolith",
    "components": ["Lambda", "CloudFront", "Auth0", "RDS"],
    "pain_points": ["Cold starts", "Regional latency", "Complex auth"]
  },
  "target_architecture": {
    "description": "Edge-native architecture on Cloudflare",
    "components": ["Workers", "AI Gateway", "Access", "D1", "R2"],
    "benefits": ["Sub-50ms globally", "Zero cold starts", "Simplified auth"]
  },
  "migration_path": [
    "Phase 1: Replace CloudFront with Cache Rules",
    "Phase 2: Move Lambda to Workers",
    "Phase 3: Replace Auth0 with Access",
    "Phase 4: Add AI Gateway for fraud detection"
  ],
  "diagram": "mermaid diagram text",
  "cost_comparison": {
    "current_monthly": "$12,000",
    "target_monthly": "$4,500",
    "savings": "$7,500/month"
  }
}
```

---

## How It Works

### Phase 1: Vector Search (RAG)

```
Current Stack: ["AWS Lambda", "CloudFront", "Auth0"]
  ↓
For each component:
  - Create embedding: "AWS Lambda alternative"
  - Search Vectorize: top 3 Cloudflare products
  - Results: ["Workers", "Pages", "Durable Objects"]
  ↓
Aggregate: Best matches for entire stack
```

### Phase 2: Architecture Design

```
Matches + Use Case → Workers AI
  ↓
Generate:
  - Current architecture description
  - Target architecture (Cloudflare-native)
  - Migration phases (prioritized)
  - Mermaid diagram
  - Cost estimate
```

### Phase 3: Validation

```
Target architecture → Vectorize search
  ↓
Verify: Each recommended product exists in docs
Confidence: Based on match quality
```

---

## Vectorize Setup

### What We Need to Index

Cloudflare product documentation chunks:
- Workers (compute)
- Pages (hosting)
- KV (cache)
- D1 (database)
- R2 (storage)
- AI Gateway (AI routing)
- Vectorize (vector DB)
- Access (identity)
- WAF (security)
- Bot Management
- DDoS Protection
- CDN / Cache
- Load Balancing
- Stream (video)
- Images

### Chunk Strategy

Each product gets multiple chunks:
```
Product: Workers
Chunks:
  1. "Cloudflare Workers: Serverless compute at the edge..."
  2. "Workers vs AWS Lambda: Workers run on V8 isolates..."
  3. "Workers pricing: $5 per 10 million requests..."
  4. "Workers use cases: API gateways, edge rendering..."
```

---

## Architecture

```
User Input (tech stack)
  ↓
Embedding Generator (Workers AI)
  ↓
Vectorize Search (top-k matches)
  ↓
Context Builder (aggregate results)
  ↓
Architecture Designer (Workers AI)
  ↓
Validator (check against Vectorize)
  ↓
Structured Output (JSON)
```

---

## API Contract

```typescript
interface ArchitectureInput {
  company_name: string;
  current_stack: string[];
  use_case?: string;
  traffic_volume?: string; // "10K req/day", "1M req/day"
  compliance?: string[]; // ["SOC2", "PCI-DSS"]
}

interface ArchitectureOutput {
  current_architecture: {
    description: string;
    components: string[];
    pain_points: string[];
  };
  target_architecture: {
    description: string;
    components: string[];
    benefits: string[];
  };
  migration_path: string[];
  diagram: string; // Mermaid syntax
  cost_comparison: {
    current_monthly: string;
    target_monthly: string;
    savings: string;
  };
  confidence: number;
}
```

---

## Implementation Plan

1. **Create Vectorize index** (if not exists)
2. **Seed with Cloudflare product docs** (manual chunks)
3. **Build ArchitectureAgent class**
4. **Add embedding generation**
5. **Add vector search**
6. **Add architecture synthesis**
7. **Test end-to-end**
8. **Update Orchestrator to route to Architecture Agent**

---

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Vector size | 768 (Workers AI default) | Matches `@cf/baai/bge-base-en-v1.5` |
| Distance metric | Cosine | Standard for semantic search |
| Chunk size | 512 tokens | Balance between granularity and context |
| Top-k search | 5 | Enough variety without noise |

---

*Next: Implementation*
