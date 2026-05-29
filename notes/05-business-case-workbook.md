# Business Case Agent Workbook: Active Learning for Phase 3

> **Date:** 2026-05-28
> **Goal:** Understand prompt chaining, grounded ROI, and objection handling well enough to build the Business Case Agent
> **Format:** Read > Discuss > Cloudflare Lens > Exercise > Self-Check
> **Estimated time:** ~55 minutes
> **Status:** Not Started

---

## How to Use This Workbook

Same pattern as the Vectorize RAG workbook:

| Icon | Section | What You Do |
|------|---------|-------------|
| 📖 | **READ** | Read the theory (2-3 paragraphs) |
| 🤔 | **DISCUSS** | Write your answer in your own words |
| ☁️ | **CLOUDFLARE LENS** | How Cloudflare implements this |
| 🏢 | **COMPETITOR CHECK** | How other vendors handle it |
| ✏️ | **EXERCISE** | Hands-on task |
| ✅ | **SELF-CHECK** | Reveal the answer after you attempt the exercise |

**Rules:**
1. Write your answers BEFORE looking at the self-check
2. Messy answers are fine — this is for learning, not grading
3. Flag anything confusing with `❓` — we'll discuss it

---

# Module 1: Prompt Chaining

**Estimated time:** 10 minutes

---

## 📖 READ

Our co-pilot now has two agents: Research and Architecture. Each runs independently — the user asks a question, the orchestrator routes it, one agent runs, result comes back. But real SE conversations are multi-step:

1. "Research Datadog" → Research Agent runs, returns company profile
2. "Design an architecture to replace their stack with Cloudflare" → Architecture Agent runs, returns migration plan
3. "Build a business case for that migration" → Business Case Agent runs — **but it needs the output from step 2**

This is **prompt chaining** — passing the structured output of one agent into the context of the next agent. It's not just "two prompts in a row." The hard part is **what data flows between them**.

The Architecture Agent output is roughly 2KB of JSON with 8 top-level fields. If you dump all of it into the Business Case Agent's prompt alongside Vectorize-retrieved pricing chunks, you'll blow past the model's useful context window. The model starts ignoring things. Quality drops.

The solution: **selective extraction**. The Business Case Agent only needs 3 fields from the Architecture output:

- `component_mapping` — what's being replaced with what (this is the backbone of the cost comparison)
- `cost_comparison.savings_percentage` — the headline number to anchor ROI
- `gaps` — what Cloudflare can't replace (honesty builds trust)

Everything else — `current_architecture.description`, `target_architecture.benefits`, `migration_path` phases — is useful for a human but noise for the business case LLM call.

**How does the data get from Agent A to Agent B?** In our system, it's already solved. The orchestrator stores every agent's output in KV session history after each run (see `src/orchestrator.ts` lines 66-73). When the Business Case Agent runs, it reads the session history, finds the most recent Architecture Agent output, and extracts the 3 fields it needs.

No re-running agents. No extra LLM calls. Just a KV read.

---

## 🤔 DISCUSS

**Question 1:** In your own words, why can't the Business Case Agent just re-run the Architecture Agent internally to get the data it needs? What's the cost (time, money, reliability) of re-running vs reading from KV?

*(Write your answer here)*



**Question 2:** What should the Business Case Agent do if there's NO prior Architecture Agent output in the session history? The user just says "build me a business case for replacing Zscaler." There are three options:

- **Option A:** Fail — return an error: "Run the architecture step first"
- **Option B:** Ask — "I need your current tech stack first. What are you running?"
- **Option C:** Proceed — run with just the user's message, lower confidence

Which would you pick and why? Think about what a good SE would do on a call.

*(Write your answer here)*



---

## ☁️ CLOUDFLARE LENS

KV is why chaining is cheap:

| Operation | Cost | What Happens |
|-----------|------|-------------|
| Read session history | $0.50 per million reads | Read the Architecture Agent output from KV |
| Write session update | $5.00 per million writes | Store the Business Case Agent output |
| Re-run Architecture Agent | ~30-40 seconds + Workers AI inference | Wasteful — the data already exists |

**The math:** Chaining two agents via KV costs $0.0000055 per chain (one read + one write). Re-running the first agent costs 30-40 seconds of wall-clock time and another Workers AI inference call.

**Source:** [Cloudflare KV Pricing](https://developers.cloudflare.com/kv/platform/pricing/)

---

## ✏️ EXERCISE

Look at this Architecture Agent output. Circle (or list) exactly which fields the Business Case Agent needs, and explain why for each one:

```json
{
  "current_architecture": {
    "description": "AWS-based architecture for fintech startup",
    "components": ["AWS Lambda", "AWS CloudFront", "AWS S3", "Cisco AnyConnect VPN"],
    "pain_points": ["DDoS limitations", "VPN latency"]
  },
  "target_architecture": {
    "description": "Cloudflare-native architecture",
    "components": ["Workers", "CDN", "R2", "Access"],
    "benefits": ["Zero cold starts", "Global edge", "Zero egress"]
  },
  "component_mapping": [
    {"current": "AWS Lambda", "cloudflare": "Workers", "migration_complexity": "moderate", "notes": "Zero cold starts"},
    {"current": "AWS CloudFront", "cloudflare": "CDN", "migration_complexity": "simple", "notes": "Free CDN"},
    {"current": "AWS S3", "cloudflare": "R2", "migration_complexity": "simple", "notes": "Zero egress"},
    {"current": "Cisco AnyConnect", "cloudflare": "Access", "migration_complexity": "simple", "notes": "ZTNA"}
  ],
  "migration_path": {
    "phase_1_quick_wins": ["CDN migration", "R2 for storage"],
    "phase_2_core": ["Workers for compute"],
    "phase_3_optimize": ["Access for VPN replacement"]
  },
  "cost_comparison": {
    "current_estimated_monthly": "$10,000 - $20,000",
    "target_estimated_monthly": "$5,000 - $10,000",
    "savings_percentage": "50-75%",
    "key_savings": ["R2 zero egress", "CDN included free"]
  },
  "gaps": ["No direct equivalent for relational databases at RDS scale"],
  "enterprise_considerations": ["Enterprise tier for WAF managed rules"],
  "confidence": 0.8
}
```

**Which fields does the Business Case Agent need?**

*(List them here with a one-sentence reason for each)*



---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal answer (attempt the exercise first!)</summary>

The Business Case Agent needs exactly 3 fields:

1. **`component_mapping`** — This is the backbone. Each row becomes a line item in the cost comparison table. "AWS Lambda → Workers" tells us which Cloudflare pricing chunk to retrieve and which competitor to compare against.

2. **`cost_comparison.savings_percentage`** — The headline ROI anchor. Instead of asking the LLM to calculate savings from scratch (risky — it might hallucinate), we give it this number as a starting point: "The architecture analysis estimated 50-75% savings. Validate this against the pricing data below."

3. **`gaps`** — These become honest disclaimers in the business case. "Note: Cloudflare does not have a direct equivalent for RDS. Database migration is outside this scope." This builds trust.

**What we skip and why:**
- `current_architecture` / `target_architecture` — narrative descriptions the LLM doesn't need; it has the component mapping which is more precise
- `migration_path` — useful for humans but not relevant to cost/ROI calculation
- `enterprise_considerations` — these are architecture decisions, not business case inputs
- `confidence` — the Business Case Agent calculates its own confidence

</details>

---

# Module 2: Output Schema Design

**Estimated time:** 10 minutes

---

## 📖 READ

The Business Case Agent serves three audiences at once:

**The CTO** wants: one paragraph, the bottom line, and the recommended next step. They'll spend 30 seconds reading your business case. If the executive summary doesn't land, they never read the rest.

**The VP of Finance** wants: a cost comparison table with line items, an annual savings number, and a payback period. They'll compare your numbers to the Zscaler renewal quote sitting on their desk.

**The SE (you)** wants: objection handling responses and risk assessment. You need these during the call when the prospect pushes back.

The schema needs to serve all three without repeating data. Here's the design principle: **structure the output so each audience can read their section and ignore the rest.**

One subtlety: **temperature control per section**. Factual sections (cost comparison, pricing numbers) should be generated with low temperature (`0.1-0.2`) — you want the model to stick close to the retrieved pricing data, no creativity. Narrative sections (executive summary, objection responses) should use slightly higher temperature (`0.3-0.4`) — enough to sound natural, not enough to hallucinate.

In Workers AI, you can only set one temperature per call, so we'll use `0.3` as the compromise — factual enough for pricing, natural enough for narrative. If we moved to AI Gateway with separate model calls per section, we could tune temperature per section. That's a Phase 4+ optimization.

---

## 🤔 DISCUSS

**Question 1:** Look at this schema. What's missing for an **enterprise** conversation that wouldn't matter in a **startup** conversation?

```json
{
  "executive_summary": "string",
  "roi": {
    "annual_savings": "$X",
    "payback_period": "X months",
    "assumptions": ["string"]
  },
  "cost_comparison": {
    "current": {},
    "cloudflare": {},
    "monthly_delta": "$X"
  },
  "competitive_positioning": [],
  "objection_handling": [],
  "risk_assessment": {},
  "recommended_next_step": "string",
  "confidence": 0.0
}
```

*(Write your answer here — what fields would you add for enterprise?)*



**Question 2:** Why does the `assumptions` array in `roi` matter? What happens if the agent outputs "You will save $240,000/year" with no assumptions listed?

*(Write your answer here)*



---

## ☁️ CLOUDFLARE LENS

Workers AI model behavior at different temperatures:

| Temperature | Use Case | Example |
|------------|---------|---------|
| 0.1 | Cost numbers, product names, pricing | "R2 costs $0.015/GB/month with zero egress fees" |
| 0.3 | Balanced (our default) | Good for mixed factual + narrative output |
| 0.5 | Executive summary, objection handling | "Cloudflare consolidates your CDN, WAF, and Zero Trust under one contract — reducing vendor management overhead by 60%" |
| 0.7+ | Creative writing | Too risky for sales materials — model starts embellishing |

We use `0.3` because Workers AI only supports one temperature per call. If we split into multiple calls (one for numbers, one for narrative), we'd increase latency by 15-25s. The tradeoff isn't worth it right now.

---

## ✏️ EXERCISE

Add fields to the schema above that would make it useful for **both** startup and enterprise conversations. Write the complete schema:

```json
{
  // Write your complete schema here
  // Think about: what does a CTO need? VP Finance? CISO? SE on the call?
}
```

*(Write your schema here)*



---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal answer (attempt the exercise first!)</summary>

Here's the schema we'll implement:

```json
{
  "executive_summary": "One paragraph. Written for a CTO, not an engineer. The bottom line.",

  "roi": {
    "annual_savings": "$X",
    "payback_period": "X months",
    "assumptions": [
      "50-person company",
      "10TB/month egress",
      "Industry-average Zscaler pricing at $160/user/year"
    ]
  },

  "cost_comparison": {
    "line_items": [
      {
        "component": "VPN / Zero Trust",
        "current_product": "Zscaler ZPA",
        "current_cost": "$8,000/yr",
        "cloudflare_product": "Access + Gateway",
        "cloudflare_cost": "$3,000/yr",
        "annual_saving": "$5,000",
        "notes": "Includes WARP client for all users"
      }
    ],
    "total_current": "$X/yr",
    "total_cloudflare": "$X/yr",
    "total_saving": "$X/yr",
    "saving_percentage": "X%"
  },

  "competitive_positioning": [
    {
      "vs": "Zscaler",
      "cloudflare_advantage": "Single platform for CDN + WAF + Zero Trust. No SKU sprawl. One dashboard.",
      "honest_gap": "Zscaler has more mature DLP and CASB features. Cloudflare's DLP is newer."
    }
  ],

  "objection_handling": [
    {
      "objection": "We already have Zscaler for Zero Trust",
      "response": "Zscaler charges per-user per-SKU. ZIA and ZPA are separate licenses. Add CASB, DLP, or Browser Isolation and each is another line item. Cloudflare Access + Gateway + WARP is one product family, one contract. For a 50-person team, that's typically 40-60% cheaper.",
      "segment": "both"
    }
  ],

  "risk_assessment": {
    "migration_risk": "low | medium | high",
    "key_risks": ["string"],
    "mitigations": ["string"]
  },

  "contract_consolidation": {
    "current_vendors": 4,
    "target_vendors": 1,
    "contracts_eliminated": ["Zscaler", "Akamai", "Imperva"],
    "management_benefit": "One dashboard, one support contract, one renewal negotiation"
  },

  "compliance_posture": {
    "certifications": ["SOC 2 Type II", "ISO 27001", "FedRAMP Moderate"],
    "note": "Cloudflare maintains SOC 2 Type II, ISO 27001, PCI DSS Level 1, and FedRAMP Moderate authorization"
  },

  "recommended_next_step": "30-day PoC: migrate CDN and R2 first (zero risk, immediate cost reduction). Evaluate Access + Gateway in parallel.",

  "confidence": 0.0
}
```

**Enterprise-specific fields:**
- `contract_consolidation` — enterprises care about vendor count, procurement complexity, and renewal negotiations
- `compliance_posture` — enterprises need SOC 2 / ISO / FedRAMP checkboxes before they can move forward

**Why both segments get both fields:** A Series B startup that just hired a Head of Security will start asking about SOC 2. And even a 20-person startup benefits from "replace 3 vendors with 1." So we include both but the LLM adjusts the emphasis based on context.

</details>

---

# Module 3: Grounding ROI in Real Numbers

**Estimated time:** 15 minutes

---

## 📖 READ

ROI estimates are the most dangerous part of a business case. If the LLM hallucinates a savings number, and you put that in front of a CFO, you've destroyed your credibility.

Three rules for grounded ROI:

**Rule 1: Never ask the LLM to generate a number from scratch.** Instead, give it a number and ask it to reason from there. This is called a **pricing anchor**. We retrieve Cloudflare pricing from Vectorize (the same chunks we already indexed — R2 at $0.015/GB, Workers at $0.30/million requests, etc.) and inject them into the prompt. The LLM calculates delta, it doesn't invent prices.

**Rule 2: Always flag estimates as estimates.** "Based on industry averages for a 50-person company, we estimate annual savings of $8,000-$12,000" is honest and defensible. "You will save $10,000/year" is a promise you can't keep. The `assumptions` array in the schema exists for this reason.

**Rule 3: Use conservative math.** If the real saving is 60%, say 40-50%. Prospects who discover the actual saving is higher feel good. Prospects who discover you oversold feel burned. This is the SE playbook — underpromise, overdeliver.

**How Vectorize queries work for pricing:**

The Business Case Agent makes two parallel Vectorize queries per component:

```
Query A: "cloudflare workers pricing cost enterprise free paid"
  → Retrieves: Workers pricing chunk ($0.30/million requests, 10M free, etc.)

Query B: "aws lambda pricing cost per request"
  → Retrieves: Workers comparison chunk (which mentions Lambda's $0.20/million + $0.0000166/GB-s)
```

The LLM gets both prices in its context and calculates the delta. It doesn't invent either number.

---

## 🤔 DISCUSS

**Question 1:** You're on a call with a Series B CTO. You show them the business case: "Estimated annual savings: $8,784." They ask, "How did you get that number?" Walk through what you'd say — trace the math from individual line items to the total.

*(Write your answer here)*



**Question 2:** Why is hallucinated ROI worse than no ROI at all? What happens to the deal if the prospect's finance team checks your numbers and they don't add up?

*(Write your answer here)*



---

## ☁️ CLOUDFLARE LENS

The Vectorize pricing chunks we already indexed include real dollar amounts:

| Product | Pricing Chunk Data (already in Vectorize) |
|---------|------------------------------------------|
| Workers | 10M requests/month free. Paid: $0.30/million requests. $0.02/million ms CPU time. |
| R2 | 10GB free. Then $0.015/GB-month storage. Zero egress. Zero API fees for reads. |
| D1 | 5M rows read/day free. Paid: $0.001/million rows read. $1.00/million rows written. |
| CDN | Free on all plans. Unlimited bandwidth. |
| Access | 50 users free. Enterprise: per-user contract pricing. |

The Business Case Agent queries these same chunks. It doesn't need a separate pricing database.

**Source:** [Cloudflare Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

---

## ✏️ EXERCISE — Scenario A: Startup (Series B, ~50 engineers)

Fill in the Cloudflare cost and annual saving for each row. Use your best knowledge of Cloudflare pricing. Estimates are fine — this is about understanding the math, not being exact.

| Current Tool | Current Cost | Cloudflare Replacement | CF Cost | Annual Saving |
|-------------|-------------|----------------------|---------|---------------|
| Vercel Pro | ~$150/mo | Workers + Pages | | |
| Supabase Pro | ~$25/mo | D1 + KV | | |
| Zscaler ZPA (50 users) | ~$667/mo ($8k/yr) | Access + Gateway | | |
| Akamai (basic CDN) | ~$300/mo | CDN (included) | | |
| **Total** | **~$1,142/mo** | | | |

*(Fill in the blanks)*



---

## ✏️ EXERCISE — Scenario B: Enterprise (2,000 employees)

Same exercise, enterprise scale:

| Current Tool | Current Cost | Cloudflare Replacement | CF Cost | Annual Saving |
|-------------|-------------|----------------------|---------|---------------|
| Akamai CDN | ~$50k/yr | CDN + Argo | | |
| Palo Alto GlobalProtect | ~$200k/yr | Access + Gateway + WARP | | |
| Imperva WAF | ~$80k/yr | WAF + DDoS + Bot Mgmt | | |
| AWS CloudFront + Shield | ~$30k/yr | CDN + DDoS Pro | | |
| **Total** | **~$360k/yr** | | | |

*(Fill in the blanks)*



---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal Scenario A answer</summary>

| Current Tool | Current Cost | Cloudflare Replacement | CF Cost | Annual Saving |
|-------------|-------------|----------------------|---------|---------------|
| Vercel Pro | ~$150/mo | Workers + Pages | ~$5/mo (Workers Paid plan) | ~$1,740/yr |
| Supabase Pro | ~$25/mo | D1 + KV | ~$5/mo | ~$240/yr |
| Zscaler ZPA (50 users) | ~$667/mo ($8k/yr) | Access + Gateway | ~$400/mo (est. contract) | ~$3,200/yr |
| Akamai (basic CDN) | ~$300/mo | CDN (included) | $0 | ~$3,600/yr |
| **Total** | **~$1,142/mo** | | **~$410/mo** | **~$8,784/yr** |

**Key talking points:**
- CDN is literally free on Cloudflare. That $300/mo Akamai spend goes to zero on day one.
- Workers Paid plan is $5/mo flat and includes 10M requests. Vercel Pro is $20/seat.
- The Zscaler savings depend heavily on the contract. $400/mo is conservative for 50 users on Enterprise.

</details>

<details>
<summary>Click to reveal Scenario B answer</summary>

| Current Tool | Current Cost | Cloudflare Replacement | CF Cost | Annual Saving |
|-------------|-------------|----------------------|---------|---------------|
| Akamai CDN | ~$50k/yr | CDN + Argo | ~$10k/yr | ~$40k/yr |
| Palo Alto GlobalProtect | ~$200k/yr | Access + Gateway + WARP | ~$120k/yr | ~$80k/yr |
| Imperva WAF | ~$80k/yr | WAF + DDoS + Bot Mgmt | ~$40k/yr | ~$40k/yr |
| AWS CloudFront + Shield | ~$30k/yr | CDN + DDoS Pro | ~$12k/yr | ~$18k/yr |
| **Total** | **~$360k/yr** | | **~$182k/yr** | **~$178k/yr** |

**Key talking points:**
- Palo Alto GlobalProtect is the biggest line item and the biggest savings opportunity. The per-user cost at 2,000 employees is brutal.
- The Zscaler/Palo Alto pitch isn't just cost — it's SKU consolidation. Each "feature" (DLP, CASB, Browser Isolation) is a separate license with Zscaler. Cloudflare bundles them.
- Enterprise CDN pricing at Cloudflare scales much better than Akamai's volume-based pricing model.

**Important caveats to include in the business case:**
- Enterprise pricing is contract-based and varies. These are industry-average estimates.
- Migration costs (engineering time) are not included in this comparison.
- Some Palo Alto features (e.g., mature NGFW) don't have direct Cloudflare equivalents.

</details>

---

## 📊 BONUS: Plan Tier Table

This table shows what unlocks at each Cloudflare plan tier. The agent will use this in its system prompt so it can accurately respond to "your free plan doesn't have what we need."

| Feature | Free | Pro ($20/mo) | Business ($200/mo) | Enterprise |
|---------|------|-------------|-------------------|------------|
| CDN + Caching | ✅ | ✅ | ✅ | ✅ |
| DDoS (L3/L4) | ✅ Unmetered | ✅ Unmetered | ✅ Unmetered | ✅ Unmetered |
| DDoS (L7) | Basic | Basic | Advanced | Advanced + Analytics |
| WAF (managed rules) | ❌ | ✅ (limited) | ✅ | ✅ + custom rulesets |
| Bot Management | ❌ | ❌ | ❌ | ✅ |
| API Shield | ❌ | ❌ | ❌ | ✅ |
| Access (ZTNA) | 50 users free | 50 users | Pay-per-user | Contract pricing |
| Gateway (SWG) | 50 users free | 50 users | Pay-per-user | Contract pricing |
| WARP (device client) | ✅ Basic | ✅ Basic | ✅ | ✅ + managed profiles |
| Workers | 100K req/day | 100K req/day | 100K req/day | Included in contract |
| Workers Paid ($5/mo) | N/A | ✅ 10M req/mo | ✅ 10M req/mo | Custom |
| R2 | 10GB free | 10GB free | 10GB free | Custom |
| D1 | 5M reads/day | 5M reads/day | 5M reads/day | Custom |
| SLA | None | None | 100% uptime | Custom SLA |
| Support | Community | Email | Priority chat + email | Named CSM + phone |
| Log retention | ❌ | ❌ | 72 hours | Custom (Logpush) |

**The SE pitch for plan tiers:**

For startups: "You get enterprise-grade DDoS protection and CDN for free. Literally free. Start on the free plan, add Workers Paid when you need compute, upgrade to Pro or Business when you need WAF rules. You never pay for what you don't use."

For enterprises: "Enterprise unlocks Bot Management, API Shield, custom WAF rulesets, Logpush, and named support. But the real value is the contract — one line item for CDN, WAF, DDoS, Zero Trust, Workers, R2. No SKU sprawl."

---

# Module 4: Objection Handling

**Estimated time:** 10 minutes

---

## 📖 READ

There are two types of objection handling in an AI-powered business case:

**Static objections** — the same response every time, regardless of the prospect's stack. These are product-level facts: "Does Cloudflare have SOC 2? Yes." "What's the SLA? 100% on Business plan, custom on Enterprise." These live in the agent's system prompt as hardcoded knowledge.

**Dynamic objections** — tailored to what products are being displaced. If the prospect uses Zscaler, the agent generates Zscaler-specific positioning (cost/SKU sprawl/consolidation). If they use Akamai, different positioning (CDN performance/pricing). These are generated by the LLM using the component mapping from the Architecture Agent and pricing data from Vectorize.

**The honest gap principle:** The most credible business case includes what Cloudflare CAN'T do. Saying "Cloudflare doesn't have a direct equivalent for Zscaler's mature DLP module — you'd use a third-party integration or wait for our DLP roadmap" builds more trust than pretending Cloudflare does everything. Prospects who discover gaps on their own feel misled. Prospects you tell about gaps proactively trust you.

**The Zscaler-specific breakdown (from your real conversations):**

Three angles that land:

1. **Cost / SKU sprawl:** Zscaler charges per-user, per-SKU. ZIA (internet access) and ZPA (private access) are separate licenses. Want CASB? Another SKU. DLP? Another SKU. Browser Isolation? Another. Cloudflare bundles Access + Gateway + WARP + Browser Isolation into one product family.

2. **Complexity:** "To get feature X, you need the Transformation tier plus the Advanced Add-On Bundle." That's a real Zscaler procurement conversation. With Cloudflare, the enterprise tier includes the full stack. One contract, one negotiation.

3. **Consolidation / platform play:** A startup CTO with Zscaler for ZT, Akamai for CDN, and Imperva for WAF has three dashboards, three support contracts, three renewal negotiations. Cloudflare replaces all three. For management, this is massive — fewer vendor relationships, one audit scope, one throat to choke.

---

## 🤔 DISCUSS

For each objection below, write your instinctive one-sentence response. Don't overthink it — what would you actually say on a customer call? These will be compared against what we bake into the agent.

| # | Objection | Your Response |
|---|-----------|--------------|
| 1 | "We're already on AWS, migration is too risky" | |
| 2 | "Cloudflare is just a CDN, not an enterprise platform" | |
| 3 | "We don't have budget for another vendor" | |
| 4 | "We need SOC 2 / FedRAMP / HIPAA" | |
| 5 | "What's the SLA? We need 99.99%" | |
| 6 | "Our engineers don't know Cloudflare Workers" | |
| 7 | "We're happy with Vercel / Netlify" | |
| 8 | "Your free plan doesn't have what we need" | |
| 9 | "Why pay for Enterprise when Pay-as-you-go works?" | |
| 10 | "We already have Zscaler for Zero Trust" | |

*(Write your responses in the table)*

---

## ✏️ EXERCISE

Pick the **3 objections you hear most often** in your startup deals right now. For each one, write:

1. The objection (exact words the prospect uses)
2. Your response (what you say on the call)
3. The follow-up question you ask to redirect the conversation

**Objection 1:**

- Exact words:
- Response:
- Redirect question:

**Objection 2:**

- Exact words:
- Response:
- Redirect question:

**Objection 3:**

- Exact words:
- Response:
- Redirect question:

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal the objection responses we'll bake into the agent</summary>

| # | Objection | Agent Response | Segment |
|---|-----------|---------------|---------|
| 1 | "We're already on AWS, migration is too risky" | "You don't have to migrate off AWS. Cloudflare sits in front of your origin — CDN, WAF, and DDoS protection require zero code changes. Start with DNS and CDN (30-minute migration), prove the value, then evaluate Workers and R2 for compute and storage." | Both |
| 2 | "Cloudflare is just a CDN" | "Cloudflare runs compute (Workers), databases (D1), object storage (R2), AI inference (Workers AI), and Zero Trust networking (Access + Gateway) — all at the edge. The CDN is free and included. It's a full cloud platform." | Enterprise |
| 3 | "We don't have budget" | "Cloudflare's CDN and DDoS protection are free. Workers starts at $5/month. You can consolidate your CDN + WAF + Zero Trust spend into one Cloudflare contract and likely reduce your total infrastructure cost by 40-60%." | Startup |
| 4 | "We need SOC 2 / FedRAMP / HIPAA" | "Cloudflare maintains SOC 2 Type II, ISO 27001, PCI DSS Level 1, and FedRAMP Moderate authorization. HIPAA BAAs are available on Enterprise. Compliance documentation is available on request." | Enterprise |
| 5 | "We need 99.99% SLA" | "Business plan includes 100% uptime SLA. Enterprise contracts include custom SLAs with financial credits. Cloudflare has maintained 99.999%+ uptime across its global network." | Both |
| 6 | "Our engineers don't know Workers" | "Workers uses standard JavaScript/TypeScript — same language your team already writes. There's no new framework to learn. If your team can write a fetch handler, they can write a Worker. Deployment is `npx wrangler deploy` — no infrastructure to provision." | Startup |
| 7 | "We're happy with Vercel" | "Vercel is great for frontend. Cloudflare Pages does the same thing with faster builds and no bandwidth limits. But the real value is what Vercel can't do: Workers for backend compute, R2 for storage, D1 for databases, and Zero Trust for security. It's a platform, not just a hosting service." | Startup |
| 8 | "Your free plan doesn't have what we need" | "The free plan includes unlimited CDN bandwidth, unmetered DDoS protection, and 100K Workers requests/day. Pro adds WAF rules for $20/mo. Business adds advanced DDoS and 100% SLA for $200/mo. Enterprise unlocks Bot Management, API Shield, and custom contracts. Most startups start on free or Pro and upgrade as they grow." | Startup |
| 9 | "Why pay for Enterprise?" | "Enterprise unlocks three things Pay-as-you-go can't: Bot Management and API Shield (critical for API-first companies), Logpush for compliance (SIEM integration), and a named Customer Success Manager with priority support. But the biggest value is contract consolidation — one line item for CDN, WAF, DDoS, Zero Trust, Workers, and R2. No SKU sprawl." | Startup → Enterprise |
| 10 | "We already have Zscaler" | "Zscaler charges per-user, per-SKU. ZIA and ZPA are separate licenses. Add CASB, DLP, or Browser Isolation and each is another line item and another procurement cycle. Cloudflare Access + Gateway + WARP is one product family, one contract, one dashboard. For a 50-person team, that's typically 40-60% cheaper. And you get CDN, WAF, and DDoS included — products you'd pay three other vendors for alongside Zscaler." | Both |

</details>

---

# Module 5: Chaining in the Orchestrator

**Estimated time:** 10 minutes

---

## 📖 READ

The orchestrator currently does this:

```
1. User message arrives
2. Classify intent (keyword → LLM fallback)
3. Route to single agent
4. Store result in KV
5. Log to D1
6. Return response
```

For the Business Case Agent, we need one addition: **read prior agent outputs from session history before running the agent.** The orchestrator already stores every agent's output in KV (lines 66-73 of `src/orchestrator.ts`). The session history looks like this:

```json
{
  "history": [
    { "role": "user", "content": "Design architecture for a startup using Lambda, CloudFront, S3, and Zscaler ZPA" },
    { "role": "agent", "content": { "agent": "architecture", "status": "success", "data": { ... }, ... } },
    { "role": "user", "content": "Now build a business case for that migration" },
    { "role": "agent", "content": { "agent": "business_case", "status": "success", "data": { ... }, ... } }
  ]
}
```

To find the most recent Architecture Agent output, we loop through history in reverse, find the first entry where `role === "agent"` and `content.agent === "architecture"`, and extract `content.data`.

**What if there's no prior architecture output?**

We use **Option B: Ask.** The Business Case Agent returns a helpful response: "I need to know your current tech stack to build a business case. What technologies are you running? For example: 'We use Zscaler, CloudFront, and S3.'"

This is the most SE-like behavior — a good SE doesn't guess, they ask.

**Sequential vs parallel chaining:**

Our chain is sequential: Architecture runs first, then Business Case reads its output. Within the Business Case Agent itself, the Vectorize queries (Cloudflare pricing + competitor pricing) run in parallel via `Promise.all` — same optimization we used in the Architecture Agent.

```
Sequential (between agents):
  Architecture Agent → KV → Business Case Agent

Parallel (within Business Case Agent):
  Promise.all([
    vectorize("cloudflare workers pricing"),
    vectorize("cloudflare r2 pricing"),
    vectorize("cloudflare access pricing"),
  ])
```

---

## 🤔 DISCUSS

**Question 1:** Look at `src/orchestrator.ts` lines 66-73. How does the session history get stored? What happens if two requests for the same session arrive at the same time — could they overwrite each other?

*(Write your answer here)*



**Question 2:** Should the orchestrator automatically chain agents? For example, if a user says "Build a business case for replacing their VPN", should the orchestrator:

- (A) Run the Business Case Agent only (uses whatever context is in session)
- (B) Run Architecture Agent first, then Business Case Agent automatically (full chain)
- (C) Ask the user: "I don't have architecture context. Want me to run the architecture step first?"

Which would you prefer and why?

*(Write your answer here)*



---

## ✏️ EXERCISE

Write pseudocode for the `extractPriorArchitecture` function. It takes the session history array and returns either the most recent Architecture Agent output (the `data` field) or `null`:

```
function extractPriorArchitecture(history):
  // Your pseudocode here
  //
  // Input: array of { role: "user" | "agent", content: unknown }
  // Output: the architecture data object, or null
  //
  // Remember: loop in reverse (most recent first)
  // Check: role === "agent" AND content.agent === "architecture" AND content.status === "success"
  // Return: content.data
```

*(Write your pseudocode here)*



---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal the TypeScript implementation</summary>

```typescript
/**
 * Extract the most recent successful Architecture Agent output from session history.
 * Returns the `data` field (component_mapping, cost_comparison, gaps, etc.) or null.
 */
private extractPriorArchitecture(
  history: Array<{ role: string; content: unknown }>
): Record<string, unknown> | null {
  // Loop in reverse — most recent first
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.role !== "agent") continue;

    const content = entry.content as Record<string, unknown>;
    if (content?.agent === "architecture" && content?.status === "success" && content?.data) {
      return content.data as Record<string, unknown>;
    }
  }
  return null;
}
```

This gets called in the orchestrator before routing to the Business Case Agent. The extracted data is passed into the agent via the `context` field of `AgentInput`:

```typescript
case "business_case":
  // Check for prior architecture output
  const priorArch = this.extractPriorArchitecture(session.history);
  if (priorArch) {
    agentInput.context = {
      ...agentInput.context,
      prior_architecture: priorArch,
    };
  }
  return new BusinessCaseAgent().execute(agentInput, this.env);
```

</details>

---

# Summary

## What You Learned

| Module | Key Concept |
|--------|------------|
| 1 | Prompt chaining passes selective data between agents via KV — not the full output |
| 2 | Output schema serves multiple audiences (CTO, VP Finance, SE) from one JSON object |
| 3 | ROI must be grounded in real pricing data from Vectorize — never let the LLM invent numbers |
| 4 | Static objections live in the system prompt, dynamic objections are generated per-prospect |
| 5 | The orchestrator chains agents by reading session history from KV |

## What We Build Next

Once you've completed this workbook, we'll build:

1. `src/agents/business-case.ts` — the full agent with Vectorize pricing queries, session context extraction, and structured JSON output
2. Updated `src/orchestrator.ts` — keyword patterns for `business_case` intent, routing, and `extractPriorArchitecture()` helper
3. End-to-end tests: standalone, chained (architecture → business case), and keyword routing

**Estimated build time:** ~1.5 hours after completing the workbook.

---

*When you're done, write "WORKBOOK COMPLETE" at the bottom and we'll start building.*
