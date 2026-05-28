# Vectorize & RAG Workbook: Active Learning for Phase 2

> **Date:** 2026-05-27  
> **Goal:** Understand RAG, embeddings, and Vectorize deeply enough to build the Architecture Agent  
> **Format:** Read → Discuss → Cloudflare Lens → Competitor Check → Exercise → Self-Check  
> **Estimated time:** ~2 hours  
> **Status:** In Progress

---

## How to Use This Workbook

Each module follows this pattern:

| Icon | Section | What You Do |
|------|---------|-------------|
| 📖 | **READ** | Read the theory (2-3 paragraphs) |
| 🤔 | **DISCUSS** | Write your answer in your own words |
| ☁️ | **CLOUDFLARE LENS** | How Cloudflare implements this |
| 🏢 | **COMPETITOR CHECK** | How AWS/Pinecone/Vercel handles it |
| ✏️ | **EXERCISE** | Hands-on task (design, pseudocode, or explain) |
| ✅ | **SELF-CHECK** | Reveal the answer after you attempt the exercise |

**Rules:**
1. Write your answers BEFORE looking at the self-check
2. Messy answers are fine — this is for learning, not grading
3. Flag anything confusing with `❓` — we'll discuss it

---

# Module 1: Why RAG?

**Estimated time:** 10 minutes

---

## 📖 READ

Large Language Models (LLMs) like Llama-3-8B are trained on internet data up to a cutoff date. After training, they can't learn new information. This creates three problems:

**Problem 1: Staleness.** Cloudflare launches new products quarterly. An LLM trained in 2024 doesn't know about features released in 2025. When our Architecture Agent needs to recommend Cloudflare products, it might suggest outdated solutions.

**Problem 2: Hallucination.** When an LLM doesn't know something, it doesn't say "I don't know." It confidently generates plausible-sounding nonsense. Ask Llama-3 about "Cloudflare Workers Containers" and it might describe a product that doesn't exist (or didn't exist at training time).

**Problem 3: No private data.** The LLM was never trained on Cloudflare's internal pricing, competitive positioning, or customer playbooks. It literally cannot know this information.

**RAG (Retrieval-Augmented Generation)** solves all three by retrieving relevant documents at query time and injecting them into the prompt. Instead of relying on the model's memory, we give it a cheat sheet.

```
WITHOUT RAG:
  User: "What replaces AWS Lambda on Cloudflare?"
  LLM (from memory): "Cloudflare Functions" ← WRONG, doesn't exist

WITH RAG:
  User: "What replaces AWS Lambda on Cloudflare?"
  System retrieves: [doc chunk about Workers vs Lambda]
  LLM (with context): "Cloudflare Workers replaces Lambda. Zero cold starts..." ← CORRECT
```

**The original paper:** Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (2020). [arXiv:2005.11401](https://arxiv.org/abs/2005.11401)

---

## 🤔 DISCUSS

*Think about your day-to-day as an SE. When you prep for a customer call, you don't rely on memory alone — you pull up docs, pricing pages, case studies. RAG is an LLM doing the same thing.*

**Question 1:** In your own words, what would happen if our Architecture Agent had NO RAG and a prospect asked: "We use Vercel Edge Functions. What's the Cloudflare equivalent?" What could go wrong?

The agent may pull up old documentation from the date of its completition. theres no checks and balances to make sure that the information is more up to date. especially at cloudflare, and tech in general, things move very quickly and something even a month ago might be outdated today. 

**Question 2:** Can you think of a scenario where RAG would give WORSE results than just using the LLM's trained knowledge? (Hint: what if the retrieved documents are wrong or outdated?)

Perhaps if the RAG pulls documents from the latest first, but these are rough drafts, maybe from someones personal wikis, that the information has not been verified to be 100% accurate. but it is the latest info that the agent pulls so it is treated as the source of truth.

---

## ☁️ CLOUDFLARE LENS

Cloudflare has a complete RAG stack built-in — no third-party services needed:

| RAG Step | Cloudflare Product | What It Does |
|----------|-------------------|-------------|
| **Embed text** | Workers AI (`@cf/baai/bge-base-en-v1.5`) | Convert text to vectors |
| **Store vectors** | Vectorize | Vector database for similarity search |
| **Retrieve** | Vectorize `.query()` | Find closest matching documents |
| **Generate** | Workers AI (Llama-3) | Answer using retrieved context |
| **Cache results** | KV | Don't re-embed the same query twice |
| **Log queries** | D1 | Track what's being asked for eval |

**Key advantage:** The entire pipeline runs on Cloudflare's edge. No data leaves the network. No API keys for embedding. No egress fees.

**Source:** [Cloudflare Vectorize — Build a RAG Pipeline](https://developers.cloudflare.com/vectorize/get-started/intro/)

---

## 🏢 COMPETITOR CHECK

| Approach | Stack | Pros | Cons |
|----------|-------|------|------|
| **Cloudflare (ours)** | Workers AI + Vectorize + KV | All-in-one, no API keys, edge-native | Smaller model selection than OpenAI |
| **OpenAI + Pinecone** | OpenAI embeddings + Pinecone vector DB | Best-in-class models, mature ecosystem | $0.0001/1K tokens embed + $0.10/GB Pinecone + egress fees |
| **AWS Bedrock + OpenSearch** | Bedrock embeddings + OpenSearch kNN | Enterprise compliance, AWS integration | Complex setup, regional, expensive compute |
| **Vercel + OpenAI** | Vercel AI SDK + OpenAI + third-party vector DB | Great DX for Next.js apps | No native vector DB, dependent on OpenAI uptime |
| **Supabase** | pgvector in Postgres + OpenAI | SQL + vectors in one DB | Postgres performance limits at scale |

**The SE pitch:** "With Cloudflare, your entire RAG pipeline runs at the edge. No API keys to manage, no egress fees, no third-party vector DB to provision. One `wrangler deploy` and you're live globally."

---

## ✏️ EXERCISE

*You're on a call with a CTO who says: "We built RAG with OpenAI embeddings + Pinecone. It costs us $800/month and has 200ms latency. Why should we switch to Cloudflare?"*

**Write a 3-4 sentence response that addresses cost, latency, and simplicity:**

OpenAI deploys the best-in-class models, but those best-in-class models have a cost associated with it. especially with the egress fees on pinecone. i would argue if the openai computational model isnt needed for things like complex code debugging or deployments. then cloudflare workers rag can solve the same issues for a fraction of the cost. we charge per request not token and do not charge egress fees. all while deploying to our cloudflare edge network to keep sub 50 ms latency. 

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal a strong response</summary>

"Three things change with Cloudflare's RAG stack. First, cost: Workers AI embeddings are included in your Workers Paid plan — no per-token charges. Vectorize has no per-query fees. Most customers see 5-10x cost reduction. Second, latency: embeddings and vector search run at the edge, not in a centralized Pinecone cluster. Your users in Tokyo hit Tokyo, not us-east-1. Third, simplicity: it's one platform. No API key rotation between OpenAI and Pinecone, no cross-cloud networking. One `wrangler deploy` and your RAG pipeline is live in 300+ locations."

**Key moves:** Lead with cost (their pain point), follow with latency (technical advantage), close with simplicity (operational advantage).

</details>

---

# Module 2: Embeddings — What Is a Vector?

**Estimated time:** 15 minutes

---

## 📖 READ

An embedding converts text into a list of numbers (a "vector") that captures its meaning. Think of it like converting a word into GPS coordinates — "Paris" and "France" are close on a map, while "Paris" and "pizza" are far apart.

When we pass text through an embedding model, we get an array of numbers:

```
"Cloudflare Workers is serverless compute at the edge"
        ↓
  Embedding Model (@cf/baai/bge-base-en-v1.5)
        ↓
  [0.12, -0.45, 0.89, 0.03, ..., 0.33]  ← 768 numbers
```

**Why 768 numbers?** The model was trained to use 768 dimensions to represent meaning. More dimensions = more nuance, but also more storage and slower search. 768 is a sweet spot for most use cases.

**How similarity works:** We measure the "distance" between two vectors using **cosine similarity**:
- Score of **1.0** = identical meaning
- Score of **0.0** = completely unrelated
- Score of **-1.0** = opposite meaning

```
"AWS Lambda"          vs  "serverless compute"     → 0.89 (very similar!)
"AWS Lambda"          vs  "Cloudflare Workers"     → 0.82 (similar — both serverless)
"AWS Lambda"          vs  "how to bake sourdough"  → 0.05 (unrelated)
"AWS Lambda"          vs  "Lambda calculus"         → 0.35 (shares word, different meaning)
```

**Key insight:** The embedding captures *semantic meaning*, not just keyword matching. "AWS Lambda" and "serverless compute" share zero words but have a high similarity score because they *mean* the same thing.

**The model we use:** `@cf/baai/bge-base-en-v1.5` — a BAAI (Beijing Academy of AI) model hosted on Workers AI. "bge" = BAAI General Embedding. 768 dimensions. Optimized for English semantic search.

---

## 🤔 DISCUSS

**Question 1:** Why would "AWS Lambda" and "Lambda calculus" have a moderate similarity score (0.35) even though they mean completely different things? What limitation of embeddings does this reveal?

Because the word Lambda appears in both. so when each word is broken down to a vector, aws gets a number, lambda gets a number, calculus gets a number, so the 2 lambda numbers match so the model may think that the similar score.

**Question 2:** Our Architecture Agent will embed queries like "What replaces CloudFront?" If our Vectorize index only has a chunk that says "Cloudflare CDN and Cache Rules provide global content delivery" — will the embedding similarity be high or low? Why?

i think low? cloudfront is a cdn provider, so having the chuck with ddn and cache rules providing global content delivery is good, but if our index doesnt know cloudfront is a CDN provider it wont make that connection and issue a low score?

**Question 3:** What happens if someone asks a question in German? Would the embeddings still work with our English-optimized model?

I dont think it will work but i think the model would think the german word is english and assign a vector as if, but obivously wouldnt be able to accurately assign a similar score since it is in the wrong language.

---

## ☁️ CLOUDFLARE LENS

**Workers AI Embedding Model:**

```typescript
// Generate embedding for a single text
const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
  text: "Cloudflare Workers is serverless compute at the edge"
});

// Result:
// { shape: [1, 768], data: [[0.12, -0.45, 0.89, ...]] }
```

**Batch embedding (multiple texts at once):**

```typescript
const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
  text: [
    "Cloudflare Workers is serverless compute",
    "Cloudflare D1 is a SQLite database",
    "Cloudflare R2 is S3-compatible storage"
  ]
});

// Result: { shape: [3, 768], data: [[...], [...], [...]] }
```

**Cost:** Workers AI embedding inference is essentially free on the Workers Paid plan. No per-token billing for embedding calls.

**Source:** [Workers AI — Text Embeddings](https://developers.cloudflare.com/workers-ai/models/#text-embeddings)

---

## 🏢 COMPETITOR CHECK

| Model | Dimensions | Provider | Cost | Speed |
|-------|-----------|----------|------|-------|
| `@cf/baai/bge-base-en-v1.5` | 768 | Workers AI (edge) | Included in plan | ~10ms |
| `text-embedding-3-small` | 1536 | OpenAI API | $0.02/1M tokens | ~50ms + network |
| `text-embedding-3-large` | 3072 | OpenAI API | $0.13/1M tokens | ~100ms + network |
| `amazon.titan-embed-text-v2` | 1024 | AWS Bedrock | $0.02/1M tokens | ~50ms + network |
| `Cohere embed-v3` | 1024 | Cohere API | $0.10/1M tokens | ~50ms + network |

**Tradeoff:** OpenAI's `text-embedding-3-large` (3072 dims) captures more nuance than our 768-dim model. But for our use case (matching "AWS Lambda" to "Workers docs"), 768 dims is more than sufficient. The cost and latency savings are worth it.

---

## ✏️ EXERCISE

*Imagine you're building the embedding index for our Architecture Agent. You need to embed these three text chunks. Predict which pairs will have the highest similarity score and which will have the lowest.*

**Chunk A:** "Cloudflare Workers runs JavaScript and TypeScript at the edge using V8 isolates. It replaces traditional serverless functions like AWS Lambda."

**Chunk B:** "Cloudflare D1 is a serverless SQL database built on SQLite. It stores relational data with full SQL support."

**Chunk C:** "AWS Lambda is a serverless compute platform that runs code in response to events. It supports Node.js, Python, and Java."

**Rank these pairs from highest to lowest similarity:**
1. A ↔ C: Score prediction _80__
2. A ↔ B: Score prediction _50__
3. B ↔ C: Score prediction __24_

*Explain your reasoning:*

1. A-C,  serverless compute was big on both, it i think the languages will be recognized as coding languages and will get similar scores.
2. A-B, both cloudflare products on the same platform, but one is a servess compute product and one is a storage
3. B-C, both cloud providers, but the products are differnent and the platforms are differnt. 

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal answer</summary>

**Ranking (highest to lowest):**

1. **A ↔ C: ~0.85** — Both are about serverless compute. A mentions Lambda explicitly, C IS Lambda. High semantic overlap.
2. **A ↔ B: ~0.45** — Both are Cloudflare products (shared context), but compute vs. database are different categories.
3. **B ↔ C: ~0.25** — One is a database, one is compute. Different platforms (Cloudflare vs AWS). Low overlap.

**Why this matters for our agent:** When a user asks "What replaces AWS Lambda?", Chunk A will score highest because it semantically overlaps with Lambda. Chunk B (D1) won't pollute the results. This is exactly what we want.

</details>

---

# Module 3: The RAG Pipeline — Retrieve → Augment → Generate

**Estimated time:** 15 minutes

---

## 📖 READ

RAG has three steps. Every RAG system in the world follows this pattern:

**Step 1: RETRIEVE** — Find relevant documents based on the user's query.
```
Query: "What replaces AWS Lambda?"
         ↓
Embed query → Search Vectorize → Return top 3 matching chunks
```

**Step 2: AUGMENT** — Inject those documents into the LLM's prompt.
```
System: "You are an architect. Here are relevant Cloudflare docs:
         [chunk about Workers] [chunk about Workers vs Lambda]
         
         Based on these docs, answer the user's question."
```

**Step 3: GENERATE** — The LLM answers using the retrieved context.
```
LLM: "Cloudflare Workers replaces AWS Lambda. Key advantages:
      zero cold starts, global deployment, V8 isolates..."
```

**The critical insight:** Without Step 2 (augmentation), the LLM answers from memory (unreliable). With it, the LLM answers from facts (grounded). The LLM becomes a *reasoning engine over your data* instead of a *guessing machine*.

**What makes RAG better than Ctrl+F?** Traditional search matches keywords. RAG matches *meaning*. "Lambda alternative" has zero keyword overlap with "Workers is serverless compute" — but RAG finds it because the embeddings are semantically close.

---

## 🤔 DISCUSS

**Question 1:** In Step 2 (Augment), we inject retrieved chunks into the prompt. But LLMs have a limited context window (Llama-3-8B = ~8,000 tokens). If Vectorize returns 10 chunks of 500 tokens each (5,000 tokens), plus the system prompt and user query, we might overflow. How would you handle this?

one, using a differnt model with a bigger context window? second, perhaps splitting the chunks into smaller bits and store outputs into a do? so the state of the conversation doesnt get lost but the llm doesnt get overflow?

**Question 2:** What happens if the retrieved chunks are irrelevant? For example, the user asks "What's Cloudflare's pricing for Workers?" but Vectorize returns chunks about "Workers security features" because the word "Workers" matched. How does this affect the LLM's answer?

it will give a bad answer, perhaps even hallucinate an answer since we didnt provide good iformation

**Question 3:** In our Architecture Agent, the user says "Design architecture for Stripe. They use Lambda, CloudFront, and Auth0." That's THREE different products to look up. Should we run one RAG query or three? What are the tradeoffs?

3 rag queries, they are different products so we should seperate them so we have the the most accuracte model. trade off would be speed since were making 3 calls instead of one

---

## ☁️ CLOUDFLARE LENS

**The complete RAG pipeline in Workers AI + Vectorize:**

```typescript
async function ragQuery(query: string, env: Env): Promise<string> {
  // Step 1: RETRIEVE
  // Embed the user's query
  const queryEmbedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: query,
  });
  
  // Search Vectorize for closest matches
  const matches = await env.VECTORIZE.query(queryEmbedding.data[0], {
    topK: 5,
    returnMetadata: true,
  });
  
  // Step 2: AUGMENT
  // Build context from retrieved chunks
  const context = matches.matches
    .map(m => m.metadata?.text || "")
    .join("\n\n");
  
  const augmentedPrompt = `You are a Cloudflare Solutions Engineer.
Use ONLY the following documentation to answer the question.
If the docs don't contain the answer, say "I don't have that information."

DOCUMENTATION:
${context}

QUESTION: ${query}

ANSWER:`;
  
  // Step 3: GENERATE
  const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
    prompt: augmentedPrompt,
    max_tokens: 500,
    temperature: 0.3,
  });
  
  return response.response;
}
```

**Important detail:** We set `temperature: 0.3` (not 0.7 or 1.0). Lower temperature = more deterministic = less hallucination. For factual RAG answers, you want the LLM to stick closely to the provided context, not get creative.

---

## 🏢 COMPETITOR CHECK

| Platform | RAG Implementation | Lines of Config |
|----------|--------------------|----------------|
| **Cloudflare** | Workers AI + Vectorize (native) | ~30 lines TS + `wrangler.toml` binding |
| **OpenAI + Pinecone** | OpenAI API + Pinecone SDK | ~50 lines + 2 API keys + Pinecone dashboard |
| **AWS Bedrock + OpenSearch** | Bedrock API + OpenSearch kNN + IAM | ~100 lines + CloudFormation + IAM roles |
| **LangChain** | Framework wrapper around any provider | ~20 lines Python, but hides complexity |

**The pitch:** "On Cloudflare, RAG is a first-class citizen. Workers AI for embedding and generation, Vectorize for storage and retrieval, KV for caching — all bound in `wrangler.toml`. No API keys, no third-party dashboards, no cross-cloud networking."

---

## ✏️ EXERCISE

*Write the augmented prompt for this scenario:*

**User query:** "We use Auth0 for authentication. What's the Cloudflare alternative?"

**Retrieved chunks from Vectorize:**
- Chunk 1: "Cloudflare Access provides zero trust authentication. Users authenticate once and get access to internal applications without a VPN."
- Chunk 2: "Cloudflare Access vs Auth0: Access is built into the Cloudflare network. No separate identity provider needed for basic use cases. Supports SSO via Okta, Azure AD, Google Workspace."
- Chunk 3: "Cloudflare WAF provides web application firewall protection against OWASP top 10 vulnerabilities." (irrelevant!)

**Write the full prompt you'd send to Workers AI:**

```
[Your prompt here — include system instruction, context, and question]
```
You a Solutions engineer at Cloudflare a customer if asking about Auth 0 vs Cloudflare alternative. break down chunk1, to chunk2, and make sure to include any relevant information. 

**Bonus:** How would you handle Chunk 3 being irrelevant? Should you filter it out before sending to the LLM?

yes you should filter maybe include its a platform play but dont send waf information

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal answer</summary>

**Strong augmented prompt:**

```
You are a Cloudflare Solutions Engineer helping a prospect evaluate 
Cloudflare alternatives to their current tech stack.

Use ONLY the following documentation to answer. Do not invent features 
or capabilities not mentioned in the docs. If the docs don't contain 
the answer, say "I need to check the latest documentation on that."

RELEVANT DOCUMENTATION:
---
Cloudflare Access provides zero trust authentication. Users authenticate 
once and get access to internal applications without a VPN.
---
Cloudflare Access vs Auth0: Access is built into the Cloudflare network. 
No separate identity provider needed for basic use cases. Supports SSO 
via Okta, Azure AD, Google Workspace.
---

PROSPECT'S QUESTION: We use Auth0 for authentication. What's the 
Cloudflare alternative?

Provide a structured answer with: product name, key differences from 
Auth0, and migration considerations.
```

**Handling irrelevant Chunk 3 (WAF):**

Two approaches:
1. **Score threshold:** Only include chunks with cosine similarity > 0.7. The WAF chunk would likely score < 0.5 for an "Auth0 alternative" query.
2. **Metadata filter:** Query with `filter: { category: "Security/Identity" }` to exclude WAF docs from results.

Both are valid. Score threshold is simpler; metadata filter is more precise.

</details>

---

# Module 4: Vectorize Deep Dive

**Estimated time:** 15 minutes

---

## 📖 READ

Vectorize is Cloudflare's native vector database. Think of it as a **search engine for meaning** — instead of searching by keywords (like Google), it searches by semantic similarity.

**How it works internally:**

1. **Create an index** — define vector dimensions and distance metric
2. **Upsert vectors** — insert embeddings + metadata
3. **Query** — find the nearest neighbors to a query vector

**Index structure:** Vectorize uses an Approximate Nearest Neighbor (ANN) algorithm. Rather than comparing your query vector against every single stored vector (slow), it uses a data structure that finds *approximately* the closest vectors very quickly. This means results are 99.9% as good as exact search, but 100x faster.

**Metadata:** Each vector can have metadata attached (product name, category, URL, etc.). You can filter queries by metadata, which is critical for our Architecture Agent:

```typescript
// "Show me only compute-related docs"
const results = await env.VECTORIZE.query(embedding, {
  topK: 5,
  filter: { category: { $eq: "Compute" } }
});
```

**Limitations to know:**
- Max 5 million vectors per index (sufficient for most apps)
- Metadata values must be strings, numbers, or booleans (no arrays or nested objects in filters)
- Upsert is eventually consistent (new vectors may not be queryable for a few seconds)

**Source:** [Cloudflare Vectorize Documentation](https://developers.cloudflare.com/vectorize/)

---

## 🤔 DISCUSS

**Question 1:** Our Architecture Agent needs to map 15 Cloudflare products (Workers, Pages, D1, R2, etc.). Each product has ~4 chunks (overview, comparison, pricing, use cases). That's ~60 vectors total. Is Vectorize overkill for 60 vectors? Could we just do keyword matching instead? What are the tradeoffs?

I dont think its overkill because the keyword matching might not get us the best documentation just because there is similar words in there. vectorize might be slower but we will get better answers the first time.

**Question 2:** Vectorize uses "approximate" nearest neighbor search. Why approximate instead of exact? When would approximate results be a problem?

exact might never get a hit, exact would look for a semantic score near or equal to 1 and that might never get a result. an approxiamte result might be a problem if its not complete and the model just spit it out becuase it coudlnt find something better.

**Question 3:** We can attach metadata to vectors and filter on it. Design the metadata schema for our Architecture Agent's Vectorize index. What fields would you include and why?

Semantic score > .7
overview
competitors
pricing


---

## ☁️ CLOUDFLARE LENS

**Creating a Vectorize index:**

```bash
# CLI
wrangler vectorize create cloudflare-docs \
  --dimensions=768 \
  --metric=cosine
```

```toml
# wrangler.toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "cloudflare-docs"
```

**Upserting vectors:**

```typescript
// Generate embedding
const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
  text: "Cloudflare Workers: Serverless compute at the edge..."
});

// Upsert with metadata
await env.VECTORIZE.upsert([
  {
    id: "workers-overview-001",
    values: embedding.data[0],
    metadata: {
      product: "Workers",
      category: "Compute",
      type: "overview",
      source_url: "https://developers.cloudflare.com/workers/"
    }
  }
]);
```

**Querying:**

```typescript
// Embed the user's question
const queryEmb = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
  text: "What replaces AWS Lambda?"
});

// Search with metadata filter
const results = await env.VECTORIZE.query(queryEmb.data[0], {
  topK: 5,
  returnMetadata: true,
  filter: { category: { $eq: "Compute" } }
});

// results.matches = [
//   { id: "workers-overview-001", score: 0.91, metadata: {...} },
//   { id: "workers-vs-lambda-002", score: 0.88, metadata: {...} },
//   { id: "pages-functions-003", score: 0.62, metadata: {...} }
// ]
```

**Source:** [Vectorize — Query Vectors](https://developers.cloudflare.com/vectorize/reference/client-api/#query-vectors)

---

## 🏢 COMPETITOR CHECK

| Vector DB | Hosted/Self | Pricing | Max Vectors | Unique Feature |
|-----------|------------|---------|-------------|----------------|
| **Vectorize** | Cloudflare-managed | Included in Workers Paid | 5M/index | Native Workers AI integration |
| **Pinecone** | Managed SaaS | $0.10/GB + queries | Billions | Mature, battle-tested |
| **Weaviate** | Self-hosted or cloud | Open source / $25+/mo | Billions | GraphQL API, multi-modal |
| **pgvector** (Supabase) | Managed Postgres | Postgres pricing | Limited by RAM | SQL + vectors in one DB |
| **Chroma** | Self-hosted | Free (open source) | RAM-limited | Simple Python API, prototyping |
| **OpenSearch kNN** (AWS) | Managed | Instance-based | Billions | AWS ecosystem integration |

**When Vectorize wins:** You're already on Cloudflare. You want zero config. You have < 5M vectors. You want edge-native.

**When Pinecone wins:** You need billions of vectors, multi-region replication, or you're not on Cloudflare.

---

## ✏️ EXERCISE

*Write the complete Vectorize setup for our Architecture Agent. Include:*

1. The `wrangler vectorize create` command
2. Two example vectors with metadata (pick any two Cloudflare products)
3. A query that would find them

```bash
# Your CLI command:
# CLI
wrangler vectorize create cloudflare-docs \
  --dimensions=768 \
  --metric=cosine
```
```

```typescript
// Your upsert code:
// Upsert with metadata
await env.VECTORIZE.upsert([
  {
    id: "workers-overview-001",
    values: embedding.data[0],
    metadata: {
      product: "Workers",
      category: "Compute",
      type: "overview",
      source_url: "https://developers.cloudflare.com/workers/"
    }
  }
]);
// Upsert with metadata
await env.VECTORIZE.upsert([
  {
    id: "workers-overview-002",
    values: embedding.data[0],
    metadata: {
      product: "WAF",
      category: "Web Application Firewall",
      type: "overview",
      source_url: "https://developers.cloudflare.com/WAF/"
    }
  }
]);
```

```typescript
// Your query code (for the question "We use S3 for storage. What should we use?"):
```typescript
// Embed the user's question
const queryEmb = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
  text: "We use Fortinet, what replaces it"
});

// Search with metadata filter
const results = await env.VECTORIZE.query(queryEmb.data[0], {
  topK: 5,
  returnMetadata: true,
  filter: { category: { $eq: "WAF } }
});
```

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal answer</summary>

```bash
wrangler vectorize create cloudflare-docs \
  --dimensions=768 \
  --metric=cosine
```

```typescript
// Upsert R2 and D1 vectors
const chunks = [
  {
    text: "Cloudflare R2 is S3-compatible object storage with zero egress fees. Store images, videos, backups, and static assets. Direct replacement for AWS S3 with identical API.",
    metadata: { product: "R2", category: "Storage", type: "overview", keywords: "s3,storage,object,egress" }
  },
  {
    text: "R2 vs AWS S3: R2 charges $0 for egress (S3 charges $0.09/GB). R2 uses the S3 API, so migration is often a config change. R2 pricing: $0.015/GB stored, $0 egress.",
    metadata: { product: "R2", category: "Storage", type: "comparison", keywords: "s3,aws,egress,pricing" }
  }
];

for (const chunk of chunks) {
  const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
    text: chunk.text,
  });
  
  await env.VECTORIZE.upsert([{
    id: `${chunk.metadata.product.toLowerCase()}-${chunk.metadata.type}-001`,
    values: embedding.data[0],
    metadata: chunk.metadata,
  }]);
}
```

```typescript
// Query: "We use S3 for storage. What should we use?"
const queryEmb = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
  text: "We use S3 for storage. What should we use on Cloudflare?"
});

const results = await env.VECTORIZE.query(queryEmb.data[0], {
  topK: 3,
  returnMetadata: true,
  filter: { category: { $eq: "Storage" } }
});

// Expected: R2 overview chunk scores highest (~0.90)
// R2 vs S3 comparison chunk scores second (~0.87)
```

**Key decision:** We filter by `category: "Storage"` so compute/security docs don't pollute results. The metadata filter narrows the search space before cosine similarity ranking.

</details>

---

# Module 5: Chunking Strategies

**Estimated time:** 15 minutes

---

## 📖 READ

Chunking is how you break documents into pieces for embedding. It's the **most underrated part of RAG** — bad chunking = bad retrieval = bad answers, regardless of how good your LLM is.

**The core tension:** 
- **Too small** (one sentence): Loses context. "Workers has zero cold starts" tells you nothing about what Workers IS.
- **Too large** (entire page): The embedding becomes a blurry average of everything on the page. Specific queries can't find specific answers.
- **Just right** (a paragraph or logical section): Captures enough context to be useful, specific enough to be relevant.

**Common strategies:**

| Strategy | Chunk Size | Best For | Risk |
|----------|-----------|----------|------|
| **Fixed token count** | 256-512 tokens | Uniform documents (API docs) | Might split mid-sentence |
| **Sentence splitting** | 1-3 sentences | Short, factual content | Too granular for complex topics |
| **Paragraph** | Natural paragraph breaks | Well-structured docs | Paragraph sizes vary wildly |
| **Semantic** | Topic-based sections | Long-form content | Requires more processing |
| **Overlap** | 512 tokens with 50-token overlap | Any | Prevents context loss at boundaries |

**Overlap explained:** If you chunk at exactly 512 tokens, a sentence might get split across two chunks:

```
Chunk 1: "...Workers runs on V8 isolates. The key advantage over Lambda is"
Chunk 2: "zero cold starts. Workers can handle requests in under 1ms..."
```

Neither chunk alone captures the full thought. With 50-token overlap:

```
Chunk 1: "...Workers runs on V8 isolates. The key advantage over Lambda is zero cold starts."
Chunk 2: "The key advantage over Lambda is zero cold starts. Workers can handle requests in under 1ms..."
```

Now both chunks contain the complete comparison.

---

## 🤔 DISCUSS

**Question 1:** For our Architecture Agent, we're chunking Cloudflare product documentation. Should we use one chunk per product ("everything about Workers in one chunk") or multiple chunks per product ("Workers overview," "Workers vs Lambda," "Workers pricing")? What are the tradeoffs?

multiple chunks per product, tradeoffs are more chunks to process but better overall accuracy of the specific questions asked.

**Question 2:** We want the query "Lambda alternative" to match a chunk about Workers. Should we write chunks in a neutral voice ("Workers is serverless compute") or include comparison keywords ("Workers replaces AWS Lambda with zero cold starts")? Why?

comparison keywords, were a cloudflare solutions engineer, so most questions should try and lead back to cloudflare products when discussing alternative solutions on the marketplace. and if we just have workers is a servless compute there is no line to lambda for the algorithm

**Question 3:** What if a prospect asks about a technology we DON'T have a chunk for? For example, "We use Terraform Cloud for IaC." Our index has no Terraform chunk. What happens? How should we handle it?

we should a break point where if there are no documents about the technology we then differ to human aka me to verify but not make up something.

---

## ☁️ CLOUDFLARE LENS

**Our chunking strategy for the Architecture Agent:**

We're manually writing chunks (not auto-scraping docs). This is intentional for Phase 2:

```typescript
// Each product gets 4 chunk types:
const chunkTypes = [
  "overview",     // What is this product?
  "comparison",   // How does it compare to competitor X?
  "pricing",      // What does it cost?
  "use-case"      // When should you use this?
];

// Example: Workers
const workersChunks = [
  {
    id: "workers-overview",
    type: "overview",
    text: "Cloudflare Workers is a serverless compute platform. Code runs on V8 isolates across 300+ global locations. Supports JavaScript, TypeScript, Python, Rust. Sub-millisecond cold starts. Pricing starts at $5 per 10 million requests."
  },
  {
    id: "workers-comparison",
    type: "comparison",
    text: "Workers vs AWS Lambda: Workers use V8 isolates (sub-ms cold start), Lambda uses containers (100-1000ms cold start). Workers deploy globally by default, Lambda requires regional configuration. Workers: $0.50/million requests. Lambda: $0.20/million + duration + data transfer."
  },
  {
    id: "workers-pricing",
    type: "pricing",
    text: "Workers Paid Plan: $5/month includes 10 million requests. Additional requests: $0.50 per million. CPU time: 30ms per request (50ms on bundled). No egress fees. Free plan: 100,000 requests/day."
  },
  {
    id: "workers-use-case",
    type: "use-case",
    text: "Use Workers for: API gateways, serverless backends, edge rendering, A/B testing, authentication middleware, image optimization, real-time data transformation. Not ideal for: long-running batch jobs (>30s), heavy GPU compute, large file processing (use R2 + Workers together)."
  }
];
```

**Why manual chunks for now:** We're writing 15 products x 4 chunks = 60 chunks. At this scale, hand-crafted chunks with explicit comparison keywords outperform auto-scraped docs. We can automate later with a doc scraper + chunking pipeline.

---

## 🏢 COMPETITOR CHECK

| Approach | Used By | Pros | Cons |
|----------|---------|------|------|
| **Manual chunks** (ours) | Small, curated knowledge bases | High quality, controlled keywords | Doesn't scale past ~100 docs |
| **Auto-chunking (LangChain)** | Most RAG tutorials | Scales to millions of docs | Lower quality, misses comparison keywords |
| **LlamaIndex** | Enterprise RAG | Smart node parsing, metadata extraction | Complex, heavyweight |
| **Unstructured.io** | Document processing | Handles PDF, DOCX, HTML | Another service to manage |

**Our philosophy:** Start manual, prove it works, automate later. "60 hand-crafted chunks that work" beats "10,000 auto-scraped chunks that are mediocre."

---

## ✏️ EXERCISE

*Write the 4 chunks (overview, comparison, pricing, use-case) for Cloudflare D1. Include metadata and comparison keywords that would help a query like "serverless database alternative to RDS" find the right chunk.*

```typescript
const d1Chunks = [
  {
    id: "d1-overview",
    type: "overview",
    text: "d1 storage is for memoray state, it will last longer than kv and less expensive but slower"
    metadata: { product: "D1", category: "__overview_", keywords: "___" }
  },
  {
    id: "d1-comparison",
    type: "comparison",
    text: "similar to a sql-lite database",
    metadata: { product: "D1", category: "comparison_", keywords: "_sql-lite__" }
  },
  {
    id: "d1-pricing",
    type: "pricing",
    text: "cheaper than kv, less egress than comparison",
    metadata: { product: "D1", category: "___", keywords: "___" }
  },
  {
    id: "d1-use-case",
    type: "use-case",
    text: "maining leaderboard of a call of duty lobby",
    metadata: { product: "D1", category: "___", keywords: "___" }
  }
];
```

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal answer</summary>

```typescript
const d1Chunks = [
  {
    id: "d1-overview",
    type: "overview",
    text: "Cloudflare D1 is a serverless SQL database built on SQLite. It runs at the edge with read replication across 6 global regions. Full SQL support, zero-config, scale-to-zero billing. No connection pooling or database provisioning required.",
    metadata: { product: "D1", category: "Database", keywords: "sql,sqlite,database,serverless,relational" }
  },
  {
    id: "d1-comparison",
    type: "comparison",
    text: "D1 vs AWS RDS: D1 is serverless (scale to zero), RDS requires provisioned instances ($50+/month minimum). D1 has global read replication built-in, RDS requires multi-AZ configuration. D1 pricing is per-query (rows read/written), RDS is per-hour. D1 vs PlanetScale: D1 is SQLite-based (simpler), PlanetScale is MySQL-based (more features). D1 is cheaper for low-medium traffic.",
    metadata: { product: "D1", category: "Database", keywords: "rds,aurora,planetscale,mysql,postgres,database,alternative" }
  },
  {
    id: "d1-pricing",
    type: "pricing",
    text: "D1 Pricing: Free plan includes 5M rows read/day, 100K rows written/day, 5GB storage. Paid plan: first 25 billion rows read/month included, then $0.001/million rows. First 50 million rows written/month included, then $1.00/million rows. Storage: 5GB included, $0.75/GB-month. No egress fees.",
    metadata: { product: "D1", category: "Database", keywords: "pricing,cost,free,rows,storage" }
  },
  {
    id: "d1-use-case",
    type: "use-case",
    text: "Use D1 for: user profiles, application settings, audit logs, multi-tenant per-user databases, content management, session storage. Not ideal for: time-series data at high volume (use Analytics Engine), full-text search (use Workers AI), real-time state coordination (use Durable Objects), data larger than 10GB per database.",
    metadata: { product: "D1", category: "Database", keywords: "use-case,audit,profiles,multi-tenant,cms" }
  }
];
```

**Key moves:**
- Comparison chunk includes "RDS", "PlanetScale", "MySQL", "alternative" — these are the words prospects actually use
- Pricing chunk has real numbers — the LLM can cite exact costs
- Use-case chunk includes "not ideal for" — helps the Architecture Agent avoid bad recommendations

</details>

---

# Module 6: Architecture Agent Design — Putting It Together

**Estimated time:** 20 minutes

---

## 📖 READ

Now we connect everything. The Architecture Agent takes a prospect's current tech stack and designs a Cloudflare-native architecture using RAG.

**The full flow:**

```
Input: { company: "Stripe", stack: ["Lambda", "CloudFront", "Auth0", "RDS"] }
         │
         ▼
Step 1: For each component, query Vectorize
         │
         ├── "Lambda alternative"     → Workers (0.92), Pages Functions (0.65)
         ├── "CloudFront alternative" → CDN/Cache Rules (0.88), Workers (0.42)
         ├── "Auth0 alternative"      → Access (0.90), Zero Trust (0.72)
         └── "RDS alternative"        → D1 (0.87), Hyperdrive (0.68)
         │
         ▼
Step 2: Aggregate + deduplicate
         │
         Products: Workers, CDN/Cache Rules, Access, D1
         Chunks: [top 2 chunks per product = 8 chunks]
         │
         ▼
Step 3: Build augmented prompt
         │
         "You are a Cloudflare Solutions Engineer.
          Prospect uses: Lambda, CloudFront, Auth0, RDS.
          Relevant Cloudflare docs: [8 chunks].
          Design: current vs target architecture,
          migration phases, cost comparison."
         │
         ▼
Step 4: Generate structured JSON response
         │
         {
           current_architecture: {...},
           target_architecture: {...},
           migration_path: [...],
           cost_comparison: {...},
           confidence: 0.88
         }
```

**Key design decision: Multiple queries vs. single query.**

We run ONE Vectorize query per stack component (e.g., 4 queries for a 4-component stack). Why not one combined query?

```
BAD:  "Lambda CloudFront Auth0 RDS alternative" → embedding is a blur of everything
GOOD: "Lambda alternative" → precise match to Workers docs
      "Auth0 alternative"  → precise match to Access docs
```

Multiple focused queries beat one unfocused query.

---

## 🤔 DISCUSS

**Question 1:** The flow above runs 4 Vectorize queries sequentially. Each takes ~50ms. That's 200ms just for retrieval. How would you speed this up?

have a cache for common queries that others might run?

**Question 2:** The Architecture Agent generates a "cost_comparison" field. But our Vectorize chunks have pricing info that might be outdated. How do you ensure the LLM doesn't cite wrong prices? What's the mitigation?

verify data for pricing is outdated past a month? a week? whatever your tolerance is

**Question 3:** A prospect says: "We use a custom-built message queue." There's no direct Cloudflare equivalent in our index. What should the Architecture Agent do? Options: (a) skip it, (b) hallucinate, (c) suggest the closest match, (d) say "no direct equivalent." Which and why?

c in case we can do a circumvented solution but d if not

---

## ☁️ CLOUDFLARE LENS

**Architecture Agent class structure:**

```typescript
class ArchitectureAgent implements Agent {
  name = "architecture";
  
  async execute(input: AgentInput, env: Env): Promise<AgentOutput> {
    // 1. Extract components from input
    const components = this.extractComponents(input.message);
    
    // 2. Query Vectorize for each component (parallel!)
    const retrievals = await Promise.all(
      components.map(comp => this.queryVectorize(comp, env))
    );
    
    // 3. Aggregate and deduplicate chunks
    const context = this.aggregateChunks(retrievals);
    
    // 4. Build augmented prompt
    const prompt = this.buildPrompt(input.message, context);
    
    // 5. Generate architecture recommendation
    const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      prompt,
      max_tokens: 1500,
      temperature: 0.3,
    });
    
    // 6. Parse and validate JSON output
    return this.parseOutput(response);
  }
}
```

**`Promise.all` for parallel queries** — this is the answer to the "4 sequential queries = 200ms" problem. Run all 4 at once → ~50ms total instead of 200ms.

---

## 🏢 COMPETITOR CHECK

| Approach | How They'd Build This |
|----------|-----------------------|
| **Cloudflare (ours)** | Workers + Vectorize + Workers AI. Single deploy. ~50ms retrieval. |
| **LangChain + OpenAI** | Python script + OpenAI embeddings + Pinecone. 3 services. ~200ms retrieval + network hops. |
| **AWS Bedrock** | Lambda + Bedrock + OpenSearch. CloudFormation deploy. Regional only. |
| **Vercel AI SDK** | Next.js route + OpenAI + Supabase pgvector. Good DX but multi-service. |

**Our advantage:** Single platform. No cross-service latency. `Promise.all` Vectorize queries run in the same data center as the Worker — no network hops between services.

---

## ✏️ EXERCISE

*Design the system prompt for the Architecture Agent. It must:*
1. Define the agent's role
2. Specify available information (retrieved docs)
3. Define the exact JSON output schema
4. Include error handling instructions (what to do when no match found)
5. Prevent hallucination (only use provided docs)

```
[Write your system prompt here]
```

---

## ✅ SELF-CHECK

<details>
<summary>Click to reveal a strong system prompt</summary>

```
You are a Cloudflare Solutions Engineer specializing in architecture design.
Your job is to take a prospect's current tech stack and design a 
Cloudflare-native target architecture.

RULES:
1. ONLY recommend Cloudflare products mentioned in the DOCUMENTATION section below.
2. If no Cloudflare equivalent exists for a component, set it to null and explain why.
3. Do NOT invent products or features not in the documentation.
4. Include specific pricing numbers from the documentation when available.
5. Be honest about limitations — if Cloudflare is not the best fit for a 
   component, say so.

DOCUMENTATION:
{retrieved_chunks}

PROSPECT'S CURRENT STACK: {components}
USE CASE: {use_case}

Respond with ONLY valid JSON in this exact schema:
{
  "current_architecture": {
    "description": "string — describe their current stack",
    "components": ["string array — their current products"],
    "pain_points": ["string array — likely issues with current stack"]
  },
  "target_architecture": {
    "description": "string — describe the Cloudflare target",
    "components": ["string array — recommended Cloudflare products"],
    "benefits": ["string array — advantages of migration"]
  },
  "migration_path": [
    "string array — ordered migration phases"
  ],
  "cost_comparison": {
    "current_estimated_monthly": "string",
    "target_estimated_monthly": "string",
    "savings": "string"
  },
  "gaps": ["string array — components with no direct Cloudflare equivalent"],
  "confidence": 0.0-1.0
}
```

**Key design choices:**
- "ONLY recommend products mentioned in DOCUMENTATION" prevents hallucination
- "gaps" field handles missing equivalents gracefully
- "confidence" lets the Orchestrator decide if the answer is good enough
- Strict JSON schema = Zod validation will work

</details>

---

# Module 7: RAG vs Fine-Tuning vs Prompt Engineering

**Estimated time:** 10 minutes

---

## 📖 READ

There are three ways to give an LLM domain knowledge. Understanding when to use each is a key interview topic for AI roles.

**Prompt Engineering:** Put everything in the prompt.
```
"You are a Cloudflare expert. Workers costs $5/10M requests. 
D1 costs $0.001/million rows read. R2 has zero egress fees.
Now answer: What replaces S3?"
```
- Cost: Free
- Accuracy: High (if prompt is correct)
- Limit: Context window. You can't fit 60 product docs in one prompt.

**RAG (what we're building):** Retrieve relevant docs at query time.
```
User asks → Embed → Search Vectorize → Inject top 5 chunks → Generate
```
- Cost: Low (embedding + vector search)
- Accuracy: High (grounded in real docs)
- Limit: Quality depends on chunking and retrieval

**Fine-tuning:** Retrain the model on your data.
```
Train Llama-3 on 10,000 Cloudflare doc pages → New "Llama-3-Cloudflare" model
```
- Cost: High ($100-$1000+ per training run)
- Accuracy: Variable (model memorizes, may overgeneralize)
- Limit: Retraining needed when docs change

---

## 🤔 DISCUSS

**Question 1:** Cloudflare updates pricing quarterly and launches new products regularly. Why is RAG better than fine-tuning for our Architecture Agent? What would happen if we fine-tuned and then Cloudflare changed Workers pricing?

if we fine tuned it might be bias towards old data that we have previous

**Question 2:** When WOULD fine-tuning be the right choice? Think of a scenario where RAG isn't sufficient.

best practices of architecture building? every person use case is different but if take 1000 uses cases and generalize then we can get overall best practice?

**Question 3:** Could you combine all three? For example: fine-tune for tone/style + RAG for facts + prompt engineering for output format. When would this "layered" approach make sense?

yes, for use cases were each makes sense i think thats a geat idea. 

---

## ☁️ CLOUDFLARE LENS

| Approach | Cloudflare Implementation | Update Frequency | Cost |
|----------|--------------------------|-----------------|------|
| **Prompt Engineering** | Hardcode in system prompt | Manual edit | Free |
| **RAG** | Vectorize + Workers AI embedding | Re-index weekly | ~$0 |
| **Fine-tuning** | Workers AI LoRA adapters (experimental) | Retrain monthly | $$$  |

**Our choice: RAG** — because Cloudflare docs change frequently, we need specific product details, and the cost is essentially zero.

**Source:** [Cloudflare Workers AI Fine-Tuning](https://developers.cloudflare.com/workers-ai/fine-tunes/)

---

## ✅ SELF-CHECK

<details>
<summary>When to use what — the decision tree</summary>

```
Is the knowledge static and small (<2000 tokens)?
  YES → Prompt Engineering (just put it in the system prompt)
  NO ↓

Does the knowledge change frequently (weekly/monthly)?
  YES → RAG (update index, no retraining)
  NO ↓

Do you need the model to adopt a specific tone/style/behavior?
  YES → Fine-tuning (+ RAG for facts)
  NO → RAG is sufficient
```

**For our Architecture Agent:** Knowledge changes frequently (new products, new pricing) + we need specific facts (not just style) = **RAG is the clear winner.**

</details>

---

# Module 8: Implementation Checklist — From Theory to Code

**Estimated time:** 10 minutes

---

## 📖 READ

You now understand the theory. Here's the exact implementation plan for Phase 2.

---

## ✏️ MASTER EXERCISE

*Review this implementation checklist. For each item, write a brief note about what you learned in the workbook that makes you confident you can implement it.*

- [ ] **Create Vectorize index** — `wrangler vectorize create cloudflare-docs --dimensions=768 --metric=cosine`
  - *Your note:*

- [ ] **Write product chunks** — 15 products x 4 chunks = 60 chunks with metadata
  - *Your note:*

- [ ] **Build seeding script** — Embed all chunks and upsert to Vectorize
  - *Your note:*

- [ ] **Build Architecture Agent class** — `src/agents/architecture.ts`
  - *Your note:*

- [ ] **Add component extraction** — Parse "Lambda, CloudFront, Auth0" from user message
  - *Your note:*

- [ ] **Add parallel Vectorize queries** — `Promise.all()` for each component
  - *Your note:*

- [ ] **Add prompt augmentation** — Inject retrieved chunks into system prompt
  - *Your note:*

- [ ] **Add JSON generation + Zod validation** — Parse structured output
  - *Your note:*

- [ ] **Update Orchestrator routing** — Route "architecture" intent to new agent
  - *Your note:*

- [ ] **Test: "What replaces AWS Lambda?"** — Should return Workers
  - *Your note:*

- [ ] **Test: "Design architecture for Stripe"** — Full end-to-end
  - *Your note:*

---

## 🤔 FINAL REFLECTION

**Question 1:** What's the ONE thing from this workbook that surprised you or changed how you think about RAG?

*[Your answer here]*

**Question 2:** What's the biggest risk in our Architecture Agent implementation? What could go wrong?

*[Your answer here]*

**Question 3:** If you were pitching RAG on Cloudflare to a CTO, what's your one-liner?

*[Your answer here]*

---

## Sources (Complete List)

- [RAG Original Paper — Lewis et al., 2020](https://arxiv.org/abs/2005.11401)
- [Cloudflare Vectorize Documentation](https://developers.cloudflare.com/vectorize/)
- [Cloudflare Workers AI — Embedding Models](https://developers.cloudflare.com/workers-ai/models/#text-embeddings)
- [Cloudflare Workers AI — Text Generation](https://developers.cloudflare.com/workers-ai/models/#text-generation)
- [Vectorize — Get Started](https://developers.cloudflare.com/vectorize/get-started/intro/)
- [Vectorize — Query Vectors](https://developers.cloudflare.com/vectorize/reference/client-api/#query-vectors)
- [Workers AI Fine-Tuning](https://developers.cloudflare.com/workers-ai/fine-tunes/)
- [KV Pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Pinecone — Chunking Strategies](https://www.pinecone.io/learn/chunking-strategies/)
- [LangChain — RAG Tutorial](https://python.langchain.com/docs/tutorials/rag/)

---

*Built for the edge. Built for the job. Built for understanding.*
