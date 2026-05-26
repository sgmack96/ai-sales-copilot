import { Tool } from "../types";
import { z } from "zod";

/**
 * Web Scraper Tool
 * 
 * Fetches a URL and extracts readable text content.
 * Uses Cloudflare's fetch (which runs at the edge globally).
 * 
 * Limitations:
 * - Some sites block bots (403)
 * - JavaScript-rendered sites won't work (we get raw HTML)
 * - Respect robots.txt in production
 */

export const WebScraperTool: Tool = {
  name: "web_scraper",
  description: "Fetch and extract text content from a URL. Use this to read company websites, blog posts, documentation.",
  parameters: z.object({
    url: z.string().url().describe("The URL to scrape"),
    maxLength: z.number().optional().default(5000).describe("Max characters to return"),
  }),

  async execute(params: unknown) {
    const { url, maxLength } = params as { url: string; maxLength: number };

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AI-Sales-Copilot/0.1)",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const text = extractTextFromHTML(html);
      const truncated = text.slice(0, maxLength);

      return {
        url,
        title: extractTitle(html),
        text: truncated,
        length: text.length,
        truncated: text.length > maxLength,
      };
    } catch (error) {
      return {
        url,
        error: error instanceof Error ? error.message : "Failed to fetch URL",
      };
    }
  },
};

/**
 * Extract readable text from HTML
 * Simple approach: remove scripts, styles, then extract text
 */
function extractTextFromHTML(html: string): string {
  // Remove script and style tags and their contents
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ");

  // Replace remaining tags with spaces
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match ? match[1].trim() : null;
}
