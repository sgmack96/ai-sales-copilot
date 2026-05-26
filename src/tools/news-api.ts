import { Tool } from "../types";
import { z } from "zod";

/**
 * News API Tool
 * 
 * Uses NewsAPI.org to fetch recent news about a company or topic.
 * Requires NEWS_API_KEY in environment variables.
 * 
 * Free tier: 100 requests/day
 * Paid tier: $449/month for 1M requests
 * 
 * Alternatives:
 * - GNews API
 * - New York Times API
 * - Guardian API
 */

export const NewsAPITool: Tool = {
  name: "news_api",
  description: "Fetch recent news articles about a company, technology, or topic. Use this to find product launches, funding rounds, partnerships, and industry trends.",
  parameters: z.object({
    query: z.string().min(1).describe("Company name or topic to search for"),
    days: z.number().optional().default(30).describe("How many days back to search"),
    maxResults: z.number().optional().default(5).describe("Number of articles to return"),
  }),

  async execute(params: unknown, env: { NEWS_API_KEY: string }) {
    const { query, days, maxResults } = params as { 
      query: string; 
      days: number; 
      maxResults: number;
    };

    if (!env.NEWS_API_KEY) {
      return {
        query,
        error: "NEWS_API_KEY not configured",
        articles: [],
      };
    }

    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromStr = fromDate.toISOString().split("T")[0];

      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", query);
      url.searchParams.set("from", fromStr);
      url.searchParams.set("sortBy", "relevancy");
      url.searchParams.set("language", "en");
      url.searchParams.set("pageSize", String(Math.min(maxResults, 20)));
      url.searchParams.set("apiKey", env.NEWS_API_KEY);

      const response = await fetch(url.toString());
      const data = await response.json() as {
        status: string;
        totalResults: number;
        articles: Array<{
          title: string;
          description: string;
          url: string;
          publishedAt: string;
          source: { name: string };
        }>;
        message?: string;
      };

      if (data.status !== "ok") {
        throw new Error(data.message || "NewsAPI request failed");
      }

      return {
        query,
        totalResults: data.totalResults,
        articles: data.articles.map((a) => ({
          title: a.title,
          description: a.description,
          url: a.url,
          publishedAt: a.publishedAt,
          source: a.source.name,
        })),
      };
    } catch (error) {
      return {
        query,
        error: error instanceof Error ? error.message : "Failed to fetch news",
        articles: [],
      };
    }
  },
};
