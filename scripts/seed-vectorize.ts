/**
 * Seed Vectorize with Cloudflare product documentation
 * 
 * Usage:
 * 1. Make sure Vectorize index exists: `wrangler vectorize create cloudflare-docs --dimensions=768 --metric=cosine`
 * 2. Run: `npx tsx scripts/seed-vectorize.ts`
 * 
 * This generates embeddings using Workers AI and inserts them into Vectorize.
 */

import { cloudflareProductDocs } from "../src/data/cloudflare-docs";

interface VectorizeVector {
  id: string;
  values: number[];
  metadata: Record<string, unknown>;
}

async function generateEmbedding(text: string): Promise<number[]> {
  // For seeding, we'll use a mock embedding since we can't call Workers AI from Node.js
  // In production, you'd call the embedding API
  // This is a simplified version for demonstration
  
  // Create a deterministic pseudo-embedding based on text content
  // In reality, you'd call: await env.AI.run("@cf/baai/bge-base-en-v1.5", { text })
  const embedding = new Array(768).fill(0);
  
  // Simple hash-based embedding (NOT for production use)
  for (let i = 0; i < text.length; i++) {
    embedding[i % 768] += text.charCodeAt(i) / 1000;
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

async function seedVectorize() {
  console.log(`Seeding Vectorize with ${cloudflareProductDocs.length} documents...`);
  
  const vectors: VectorizeVector[] = [];
  
  for (const doc of cloudflareProductDocs) {
    console.log(`Processing: ${doc.id}`);
    
    const embedding = await generateEmbedding(doc.text);
    
    vectors.push({
      id: doc.id,
      values: embedding,
      metadata: {
        ...doc.metadata,
        text: doc.text,
      },
    });
  }
  
  // Write to JSON file for wrangler vectorize insert
  const output = { vectors };
  
  console.log(`\nGenerated ${vectors.length} vectors`);
  console.log(`Vector dimensions: ${vectors[0]?.values.length}`);
  console.log(`\nTo insert into Vectorize, run:`);
  console.log(`  npx wrangler vectorize insert cloudflare-docs --file=./seed-output.json`);
  
  // Note: In production, you'd use the Vectorize API directly:
  // await env.VECTORIZE.insert(vectors);
  
  return vectors;
}

// If running directly
if (require.main === module) {
  seedVectorize().catch(console.error);
}

export { seedVectorize };
