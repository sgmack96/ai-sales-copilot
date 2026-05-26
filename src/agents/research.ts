import { Agent, AgentInput, AgentOutput, Env } from "../types";
import { WebSearchTool } from "../tools/web-search";
import { WebScraperTool } from "../tools/web-scraper";
import { NewsAPITool } from "../tools/news-api";

/**
 * Research Agent
 * 
 * Gathers real intelligence on a prospect company using live tools:
 * - Web search (DuckDuckGo)
 * - Web scraping (company website)
 * - News API (recent articles)
 * 
 * Then synthesizes raw data into structured output using Workers AI.
 * 
 * Fallback: If web search fails, tries common URL patterns, then falls back
 * to AI-only research with the LLM's training data.
 */

export class ResearchAgent implements Agent {
  name = "research";
  maxIterations = 5;
  tools = [WebSearchTool, WebScraperTool, NewsAPITool];

  systemPrompt = `You are a Cloudflare Solutions Engineer research analyst.
Your job is to synthesize raw research data into a structured company profile.

You will receive:
- Web search results
- Scraped text from the company website
- Recent news articles

Synthesize this into valid JSON with these fields:
- company_name: string (official name)
- website: string (main URL)
- description: string (1-2 sentence summary of what they do)
- tech_stack: string[] (technologies they use, inferred from careers page, blog, docs)
- recent_news: string[] (key headlines from last 6 months, max 5)
- competitors: string[] (main competitors mentioned)
- cloud_opportunities: string[] (specific ways Cloudflare could help, based on their stack)
- reasoning: string (summary of your analysis process)

Focus on:
1. What does the company do? (product/service)
2. What infrastructure do they use? (cloud provider, CDN, security tools)
3. What's happening recently? (launches, funding, expansion)
4. Where does Cloudflare fit? (performance, security, AI, edge compute)

If you cannot determine something, use null or empty arrays.
Output ONLY valid JSON, no markdown formatting.`;

  async execute(input: AgentInput, env: Env): Promise<AgentOutput> {
    const startTime = Date.now();
    const companyName = this.extractCompanyName(input.message);

    console.log(`[ResearchAgent] Starting research for: ${companyName}`);

    try {
      // === PHASE 1: Gather Raw Data with Tools ===
      
      // 1. Search for the company's main website
      console.log(`[ResearchAgent] Searching web...`);
      const searchResults = await WebSearchTool.execute(
        { query: `${companyName} official website`, numResults: 3 },
        env
      ) as { results?: Array<{ title: string; url: string; snippet: string }>; error?: string };

      console.log(`[ResearchAgent] Search results: ${searchResults.results?.length || 0} found, error: ${searchResults.error || 'none'}`);

      // Fallback: If search fails, try common URL patterns
      let websiteUrl: string | undefined;
      let searchData = searchResults.results || [];

      if (searchResults.error || !searchResults.results?.length) {
        console.log(`[ResearchAgent] Search failed, trying fallback URLs...`);
        websiteUrl = await this.tryFallbackUrls(companyName, env);
        
        if (!websiteUrl) {
          console.log(`[ResearchAgent] Fallback URLs failed, using AI-only mode`);
          return this.fallbackToAI(companyName, env);
        }
      } else {
        websiteUrl = searchResults.results[0].url;
      }

      console.log(`[ResearchAgent] Target website: ${websiteUrl}`);

      // 2. Scrape their website
      console.log(`[ResearchAgent] Scraping website...`);
      const scraped = await WebScraperTool.execute(
        { url: websiteUrl, maxLength: 8000 },
        env
      ) as { text?: string; title?: string; error?: string };

      if (scraped.error) {
        console.log(`[ResearchAgent] Scrape failed: ${scraped.error}`);
      } else {
        console.log(`[ResearchAgent] Scraped ${scraped.text?.length || 0} chars`);
      }

      // 3. Get recent news
      console.log(`[ResearchAgent] Fetching news...`);
      const news = await NewsAPITool.execute(
        { query: companyName, days: 180, maxResults: 5 },
        env
      ) as { articles?: Array<{ title: string; description: string; url: string; publishedAt: string; source: string }>; error?: string };

      if (news.error) {
        console.log(`[ResearchAgent] News fetch failed: ${news.error}`);
      } else {
        console.log(`[ResearchAgent] Fetched ${news.articles?.length || 0} articles`);
      }

      // === PHASE 2: Synthesize with Workers AI ===

      const rawData = {
        company_name: companyName,
        website: websiteUrl,
        search_results: searchData.map(r => ({
          title: r.title,
          snippet: r.snippet,
        })),
        website_content: scraped.error ? `Error: ${scraped.error}` : scraped.text?.slice(0, 4000),
        website_title: scraped.title,
        news_articles: news.error ? [] : news.articles?.map(a => ({
          title: a.title,
          description: a.description,
          source: a.source,
          date: a.publishedAt,
        })),
      };

      return await this.synthesize(companyName, websiteUrl, rawData, env, scraped.error ? 0.6 : 0.85);

    } catch (error) {
      console.error("[ResearchAgent] Critical failure:", error);
      
      // Ultimate fallback: AI-only
      return this.fallbackToAI(companyName, env);
    }
  }

  /**
   * Try common URL patterns when search fails
   */
  private async tryFallbackUrls(companyName: string, env: Env): Promise<string | undefined> {
    // Clean company name for URL
    const clean = companyName.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/inc$|corp$|llc$|ltd$/i, "");

    const candidates = [
      `https://www.${clean}.com`,
      `https://${clean}.com`,
      `https://www.${clean}.io`,
      `https://${clean}.io`,
    ];

    for (const url of candidates) {
      try {
        console.log(`[ResearchAgent] Trying fallback URL: ${url}`);
        const response = await fetch(url, { method: "HEAD", redirect: "follow" });
        if (response.ok) {
          // Return the final URL after redirects
          return response.url;
        }
      } catch {
        // Try next
      }
    }

    return undefined;
  }

  /**
   * Fallback to AI-only research when all tools fail
   */
  private async fallbackToAI(companyName: string, env: Env): Promise<AgentOutput> {
    console.log(`[ResearchAgent] Falling back to AI-only mode for ${companyName}`);

    const prompt = `${this.systemPrompt}

No live data could be gathered for ${companyName}. 
Use your training data to provide the best possible company profile.
Be explicit about what information comes from training data vs live sources.

Output JSON:`;

    try {
      const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        prompt,
        max_tokens: 2500,
        temperature: 0.3,
      });

      const text = (aiResponse as { response?: string }).response || "";

      let data: unknown;
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : text;
        data = JSON.parse(jsonStr);
      } catch {
        data = { raw_response: text };
      }

      return {
        agent: this.name,
        status: "partial",
        data,
        reasoning: `Web search and scraping failed. Used AI training data as fallback for ${companyName}. Information may be outdated.`,
        sources: ["workers-ai-training-data"],
        confidence: 0.5,
      };
    } catch (error) {
      return {
        agent: this.name,
        status: "failure",
        data: null,
        reasoning: `All research methods failed for ${companyName}: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: [],
        confidence: 0,
      };
    }
  }

  /**
   * Synthesize gathered data using Workers AI
   */
  private async synthesize(
    companyName: string,
    websiteUrl: string,
    rawData: unknown,
    env: Env,
    confidence: number
  ): Promise<AgentOutput> {
    const synthesisPrompt = `${this.systemPrompt}

RAW RESEARCH DATA:
${JSON.stringify(rawData, null, 2)}

SYNTHESIZED OUTPUT (JSON only):`;

    const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      prompt: synthesisPrompt,
      max_tokens: 2500,
      temperature: 0.2,
    });

    const text = (aiResponse as { response?: string }).response || "";

    let data: unknown;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      data = JSON.parse(jsonStr);
    } catch {
      data = { 
        raw_response: text,
        parse_error: "Could not parse AI response as JSON" 
      };
    }

    return {
      agent: this.name,
      status: "success",
      data,
      reasoning: `Researched ${companyName} via web search, scraped ${websiteUrl}, and fetched news. Synthesized with Workers AI.`,
      sources: [websiteUrl],
      confidence,
    };
  }

  /**
   * Extract company name from user message
   */
  private extractCompanyName(message: string): string {
    const patterns = [
      /research\s+(.+)/i,
      /tell me about\s+(.+)/i,
      /what does\s+(.+)\s+do/i,
      /look up\s+(.+)/i,
      /find info on\s+(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return message.replace(/^(research|about|find)\s+/i, "").trim();
  }
}
