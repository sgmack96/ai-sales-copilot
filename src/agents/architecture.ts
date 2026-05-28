import { Agent, AgentInput, AgentOutput, Env } from "../types";

/**
 * Architecture Agent — Phase 2 (Vectorize RAG)
 *
 * Designs Cloudflare-native architectures from a prospect's current tech stack.
 *
 * Optimized flow (2 LLM calls eliminated → 1 total):
 *   1. Extract components via regex + keyword matching (0ms, no LLM)
 *   2. Parallel Vectorize queries per component via Promise.all (~50ms)
 *   3. Aggregate + deduplicate (cap at 10 chunks to fit context window)
 *   4. Single LLM call: augmented prompt → structured JSON output
 *
 * Performance budget:
 *   - Orchestrator keyword routing:     ~0ms   (was 5-10s with LLM)
 *   - Component extraction (regex):     ~0ms   (was 5-10s with LLM)
 *   - Parallel embedding + Vectorize:   ~1-3s
 *   - Architecture generation (LLM):    ~5-15s
 *   - Total:                            ~6-18s (was 16-38s)
 */

interface RetrievedChunk {
  id: string;
  score: number;
  product: string;
  category: string;
  type: string;
  text: string;
}

interface ComponentRetrieval {
  component: string;
  chunks: RetrievedChunk[];
}

// ─── Known technology keywords for regex extraction ────────
// Maps common product names to their canonical form.
// This replaces the LLM extraction call, saving 5-10 seconds.

const TECH_KEYWORDS: Record<string, string> = {
  // AWS
  "lambda": "AWS Lambda", "aws lambda": "AWS Lambda",
  "cloudfront": "AWS CloudFront", "aws cloudfront": "AWS CloudFront",
  "s3": "AWS S3", "aws s3": "AWS S3",
  "rds": "AWS RDS", "aws rds": "AWS RDS", "aurora": "AWS Aurora",
  "dynamodb": "AWS DynamoDB", "aws dynamodb": "AWS DynamoDB",
  "elasticache": "AWS ElastiCache", "aws elasticache": "AWS ElastiCache",
  "cognito": "AWS Cognito", "aws cognito": "AWS Cognito",
  "ec2": "AWS EC2", "aws ec2": "AWS EC2",
  "ecs": "AWS ECS", "fargate": "AWS Fargate",
  "route 53": "AWS Route 53", "route53": "AWS Route 53",
  "sqs": "AWS SQS", "sns": "AWS SNS",
  "api gateway": "AWS API Gateway", "aws waf": "AWS WAF",
  "aws shield": "AWS Shield", "shield advanced": "AWS Shield Advanced",
  "global accelerator": "AWS Global Accelerator",
  "bedrock": "AWS Bedrock", "sagemaker": "AWS SageMaker",
  // GCP
  "cloud functions": "Google Cloud Functions", "cloud run": "Google Cloud Run",
  "cloud storage": "Google Cloud Storage", "gcs": "Google Cloud Storage",
  "cloud sql": "Google Cloud SQL", "bigquery": "Google BigQuery",
  "vertex ai": "Google Vertex AI",
  // Azure
  "azure functions": "Azure Functions", "azure blob": "Azure Blob Storage",
  "azure cdn": "Azure CDN", "azure sql": "Azure SQL",
  "azure ad": "Azure AD", "entra": "Microsoft Entra",
  // Vercel / Netlify
  "vercel": "Vercel", "vercel edge": "Vercel Edge Functions",
  "netlify": "Netlify", "netlify functions": "Netlify Functions",
  // Databases
  "planetscale": "PlanetScale", "supabase": "Supabase",
  "neon": "Neon", "turso": "Turso", "fauna": "Fauna",
  "cockroachdb": "CockroachDB", "mongodb": "MongoDB",
  "redis": "Redis", "upstash": "Upstash",
  // Auth / Identity
  "auth0": "Auth0", "okta": "Okta", "clerk": "Clerk",
  // CDN / Performance
  "akamai": "Akamai", "fastly": "Fastly",
  // Security
  "imperva": "Imperva", "incapsula": "Imperva",
  "datadome": "DataDome", "perimeterx": "PerimeterX",
  "signal sciences": "Signal Sciences",
  "fortinet": "Fortinet", "f5": "F5",
  "salt security": "Salt Security", "42crunch": "42Crunch",
  // Networking / VPN
  "cisco anyconnect": "Cisco AnyConnect", "anyconnect": "Cisco AnyConnect",
  "cisco vpn": "Cisco VPN", "palo alto": "Palo Alto",
  "globalprotect": "Palo Alto GlobalProtect",
  "zscaler": "Zscaler", "zscaler zia": "Zscaler ZIA", "zscaler zpa": "Zscaler ZPA",
  "prisma access": "Palo Alto Prisma Access",
  "tailscale": "Tailscale", "wireguard": "WireGuard",
  "ngrok": "ngrok",
  // SD-WAN / MPLS
  "mpls": "MPLS", "sd-wan": "SD-WAN", "sdwan": "SD-WAN",
  "viptela": "Cisco Viptela", "velocloud": "VMware VeloCloud",
  // AI
  "openai": "OpenAI API", "anthropic": "Anthropic API",
  "groq": "Groq", "replicate": "Replicate",
  "huggingface": "Hugging Face", "cohere": "Cohere",
  // Vector DBs
  "pinecone": "Pinecone", "weaviate": "Weaviate",
  "chroma": "Chroma", "milvus": "Milvus", "qdrant": "Qdrant",
  // API Gateways
  "kong": "Kong", "apigee": "Apigee",
  // Real-time
  "pusher": "Pusher", "socket.io": "Socket.io", "ably": "Ably",
  // DDoS
  "radware": "Radware", "prolexic": "Akamai Prolexic",
};

export class ArchitectureAgent implements Agent {
  name = "architecture";
  maxIterations = 3;
  tools = [];

  systemPrompt = `You are a Cloudflare Solutions Engineer specializing in architecture design for enterprise prospects.
Your job is to take a prospect's current tech stack and design a Cloudflare-native target architecture.

RULES:
1. ONLY recommend Cloudflare products mentioned in the DOCUMENTATION section below.
2. If no Cloudflare equivalent exists for a component, list it in "gaps" and explain why.
3. Do NOT invent products or features not in the documentation.
4. Include specific pricing numbers from the documentation when available.
5. Be honest about limitations. If Cloudflare is not the best fit, say so.
6. Always mention enterprise tier differences when relevant.
7. Include migration complexity (simple config change vs rewrite) for each component.

Respond with ONLY valid JSON. No markdown fences. No trailing commas. No comments.`;

  async execute(input: AgentInput, env: Env): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      // Step 1: Extract components via regex (0ms — no LLM call)
      const components = this.extractComponents(input.message);
      console.log(`[ArchitectureAgent] Extracted ${components.length} components: ${components.join(", ")} (${Date.now() - startTime}ms)`);

      if (components.length === 0) {
        // If no specific tech extracted, do a broad Vectorize query on the raw message
        console.log("[ArchitectureAgent] No components found, running broad query");
        const broadRetrieval = await this.queryVectorize(input.message, env);
        if (broadRetrieval.chunks.length > 0) {
          // Found relevant docs — generate with those
          const prompt = this.buildAugmentedPrompt(input.message, ["(inferred from query)"], broadRetrieval.chunks);
          const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
            prompt,
            max_tokens: 2500,
            temperature: 0.3,
          });
          const rawText = (response as { response?: string }).response || "";
          return {
            agent: this.name,
            status: "success",
            data: this.parseJSON(rawText),
            reasoning: `No specific components extracted. Ran broad Vectorize query, retrieved ${broadRetrieval.chunks.length} chunks.`,
            sources: [...new Set(broadRetrieval.chunks.map((c) => c.product))],
            confidence: 0.6,
          };
        }

        return {
          agent: this.name,
          status: "partial",
          data: {
            message: "I couldn't identify specific technology components. Could you list the products you're using? For example: 'We use AWS Lambda, CloudFront, RDS, and Auth0.'",
          },
          reasoning: "No technology components extracted from user message",
          sources: [],
          confidence: 0.2,
        };
      }

      // Step 2: Parallel Vectorize queries — one per component
      const retrievalStart = Date.now();
      const retrievals = await Promise.all(
        components.map((comp) => this.queryVectorize(comp, env))
      );
      console.log(`[ArchitectureAgent] Vectorize: ${components.length} queries in ${Date.now() - retrievalStart}ms`);

      // Step 3: Aggregate + deduplicate (cap at 10 chunks)
      const chunks = this.aggregateChunks(retrievals);
      console.log(`[ArchitectureAgent] ${chunks.length} chunks after aggregation`);

      // Step 4: Single LLM call — generate architecture
      const genStart = Date.now();
      const maxTokens = components.length > 3 ? 3500 : 2500;
      const prompt = this.buildAugmentedPrompt(input.message, components, chunks);

      const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        prompt,
        max_tokens: maxTokens,
        temperature: 0.3,
      });

      const rawText = (response as { response?: string }).response || "";
      console.log(`[ArchitectureAgent] LLM generation: ${Date.now() - genStart}ms`);

      let architecture = this.parseJSON(rawText);

      // Retry with simplified prompt if JSON parse failed
      if (architecture && typeof architecture === "object" && "parse_error" in architecture) {
        console.log("[ArchitectureAgent] JSON parse failed, retrying with simplified prompt");
        const retryResult = await this.retrySimplified(components, chunks, env);
        if (retryResult) architecture = retryResult;
      }

      const totalMs = Date.now() - startTime;
      console.log(`[ArchitectureAgent] Complete in ${totalMs}ms`);

      return {
        agent: this.name,
        status: "success",
        data: architecture,
        reasoning: `Extracted ${components.length} components, retrieved ${chunks.length} doc chunks via Vectorize RAG, generated architecture in ${totalMs}ms`,
        sources: [...new Set(chunks.map((c) => c.product))],
        confidence: this.calculateConfidence(components, retrievals),
      };
    } catch (error) {
      console.error("[ArchitectureAgent] Failed:", error);
      return {
        agent: this.name,
        status: "failure",
        data: null,
        reasoning: `Architecture design failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: [],
        confidence: 0,
      };
    }
  }

  // ─── Step 1: Regex Component Extraction (0ms) ───────────────

  /**
   * Extract technology components from user message using keyword matching.
   * This replaces the LLM extraction call, saving 5-10 seconds.
   *
   * Strategy:
   *   1. Normalize message to lowercase
   *   2. Match against known tech keywords (longest match first)
   *   3. Deduplicate by canonical name
   */
  private extractComponents(message: string): string[] {
    const lower = message.toLowerCase();
    const found = new Map<string, string>(); // canonical → canonical (dedup)

    // Sort keywords by length descending so "cisco anyconnect" matches before "cisco"
    const sortedKeywords = Object.entries(TECH_KEYWORDS)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [keyword, canonical] of sortedKeywords) {
      if (lower.includes(keyword) && !found.has(canonical)) {
        found.set(canonical, canonical);
      }
    }

    return [...found.values()];
  }

  // ─── Step 2: Parallel Vectorize Queries ─────────────────────

  /**
   * Query Vectorize for Cloudflare alternatives to a component.
   * Appends "alternative replacement Cloudflare" to bias toward comparison chunks.
   */
  private async queryVectorize(component: string, env: Env): Promise<ComponentRetrieval> {
    try {
      const queryText = `${component} alternative replacement Cloudflare`;
      const embeddingResponse = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: queryText,
      });

      const queryVector = (embeddingResponse as { data: number[][] }).data[0];

      const results = await env.VECTORIZE.query(queryVector, {
        topK: 5,
        returnMetadata: "all",
      });

      const SCORE_THRESHOLD = 0.55;
      const chunks: RetrievedChunk[] = (results.matches || [])
        .filter((m) => m.score >= SCORE_THRESHOLD)
        .map((m) => ({
          id: m.id,
          score: m.score,
          product: (m.metadata?.product as string) || "Unknown",
          category: (m.metadata?.category as string) || "Unknown",
          type: (m.metadata?.type as string) || "unknown",
          text: (m.metadata?.text as string) || "",
        }));

      return { component, chunks };
    } catch (error) {
      console.error(`[ArchitectureAgent] Vectorize query failed for "${component}":`, error);
      return { component, chunks: [] };
    }
  }

  // ─── Step 3: Aggregate + Deduplicate ────────────────────────

  /**
   * Aggregate chunks from all queries.
   * Dedup by ID, max 2 per product, hard cap at 10 total.
   * 10 chunks keeps the prompt under ~4000 tokens of context.
   */
  private aggregateChunks(retrievals: ComponentRetrieval[]): RetrievedChunk[] {
    const seen = new Set<string>();
    const productCount = new Map<string, number>();
    const MAX_PER_PRODUCT = 2;
    const MAX_TOTAL = 10;
    const result: RetrievedChunk[] = [];

    const allChunks = retrievals
      .flatMap((r) => r.chunks)
      .sort((a, b) => b.score - a.score);

    for (const chunk of allChunks) {
      if (result.length >= MAX_TOTAL) break;
      if (seen.has(chunk.id)) continue;

      const count = productCount.get(chunk.product) || 0;
      if (count >= MAX_PER_PRODUCT) continue;

      seen.add(chunk.id);
      productCount.set(chunk.product, count + 1);
      result.push(chunk);
    }

    return result;
  }

  // ─── Step 4: Build Augmented Prompt ─────────────────────────

  private buildAugmentedPrompt(
    userMessage: string,
    components: string[],
    chunks: RetrievedChunk[]
  ): string {
    // Group by product for readability
    const docsByProduct = new Map<string, string[]>();
    for (const chunk of chunks) {
      const list = docsByProduct.get(chunk.product) || [];
      // Truncate each chunk to 300 chars to keep prompt manageable
      const truncated = chunk.text.length > 300
        ? chunk.text.substring(0, 300) + "..."
        : chunk.text;
      list.push(`[${chunk.type}] ${truncated}`);
      docsByProduct.set(chunk.product, list);
    }

    const docsSection = Array.from(docsByProduct.entries())
      .map(([product, docs]) => `### ${product}\n${docs.join("\n")}`)
      .join("\n\n");

    return `${this.systemPrompt}

DOCUMENTATION:
${docsSection}

PROSPECT STACK: ${components.join(", ")}
USER MESSAGE: ${userMessage}

Output ONLY valid JSON:
{
  "current_architecture": {
    "description": "string",
    "components": ["string"],
    "pain_points": ["string"]
  },
  "target_architecture": {
    "description": "string",
    "components": ["string"],
    "benefits": ["string"]
  },
  "component_mapping": [
    {"current": "string", "cloudflare": "string", "migration_complexity": "simple|moderate|complex", "notes": "string"}
  ],
  "migration_path": {
    "phase_1_quick_wins": ["string"],
    "phase_2_core": ["string"],
    "phase_3_optimize": ["string"]
  },
  "cost_comparison": {
    "current_estimated_monthly": "string",
    "target_estimated_monthly": "string",
    "savings_percentage": "string",
    "key_savings": ["string"]
  },
  "gaps": ["string"],
  "enterprise_considerations": ["string"],
  "confidence": 0.0
}

JSON:`;
  }

  // ─── Retry: Simplified Prompt ───────────────────────────────

  private async retrySimplified(
    components: string[],
    chunks: RetrievedChunk[],
    env: Env
  ): Promise<unknown | null> {
    try {
      const docsText = chunks
        .map((c) => `- ${c.product}: ${c.text.substring(0, 150)}`)
        .join("\n");

      const prompt = `Map each technology to its Cloudflare replacement.

CLOUDFLARE PRODUCTS:
${docsText}

PROSPECT: ${components.join(", ")}

Output ONLY valid JSON:
{
  "component_mapping": [
    {"current": "string", "cloudflare": "string", "migration_complexity": "simple|moderate|complex", "notes": "string"}
  ],
  "gaps": ["string"],
  "enterprise_considerations": ["string"],
  "confidence": 0.0
}

JSON:`;

      const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        prompt,
        max_tokens: 1500,
        temperature: 0.2,
      });

      const text = (response as { response?: string }).response || "";
      const parsed = this.parseJSON(text);

      // Only return if it actually parsed successfully
      if (parsed && typeof parsed === "object" && !("parse_error" in parsed)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ─── JSON Parser ────────────────────────────────────────────

  private parseJSON(text: string): unknown {
    try {
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      let jsonStr = fenceMatch ? fenceMatch[1] : text;

      jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

      const start = jsonStr.indexOf("{");
      const end = jsonStr.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        jsonStr = jsonStr.slice(start, end + 1);
      }

      return JSON.parse(jsonStr);
    } catch {
      try {
        return JSON.parse(text);
      } catch {
        return {
          parse_error: "Could not parse AI response as valid JSON",
          raw_preview: text.substring(0, 500),
        };
      }
    }
  }

  // ─── Confidence Calculation ─────────────────────────────────

  private calculateConfidence(
    components: string[],
    retrievals: ComponentRetrieval[]
  ): number {
    if (components.length === 0) return 0.2;

    const matched = retrievals.filter((r) => r.chunks.length > 0).length;
    const coverage = matched / components.length;

    const allScores = retrievals
      .flatMap((r) => r.chunks.map((c) => c.score))
      .filter((s) => s > 0);

    const avgScore = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;

    return Math.round((coverage * 0.6 + avgScore * 0.4) * 100) / 100;
  }
}
