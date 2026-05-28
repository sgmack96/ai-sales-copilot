/**
 * Vectorize Seeding Module
 *
 * Embeds all product chunks via Workers AI and upserts them to Vectorize.
 * Called by POST /admin/seed endpoint.
 *
 * Flow:
 *   1. Load all 80 product chunks from cloudflare-docs.ts
 *   2. Batch-embed text using @cf/baai/bge-base-en-v1.5 (768 dims)
 *   3. Upsert vectors + metadata to Vectorize index
 *   4. Return summary (count, duration, errors)
 */

import { Env } from "./types";
import { cloudflareProductChunks, ProductChunk } from "./data/cloudflare-docs";

interface SeedResult {
  total_chunks: number;
  embedded: number;
  upserted: number;
  errors: string[];
  duration_ms: number;
}

/**
 * Seed the Vectorize index with all product chunks.
 *
 * Workers AI embedding batch limit is ~100 texts at a time,
 * so we batch in groups of 20 to stay well within limits
 * and avoid hitting CPU time caps.
 */
export async function seedVectorize(env: Env): Promise<SeedResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let embedded = 0;
  let upserted = 0;

  const BATCH_SIZE = 20; // Embed 20 chunks at a time
  const chunks = cloudflareProductChunks;

  console.log(`[Seed] Starting: ${chunks.length} chunks to embed and upsert`);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

    console.log(`[Seed] Batch ${batchIndex}/${totalBatches}: ${batch.length} chunks`);

    try {
      // Step 1: Batch embed all texts in this batch
      const texts = batch.map((c) => c.text);
      const embeddingResponse = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: texts,
      });

      // embeddingResponse.data is a 2D array: [[768 floats], [768 floats], ...]
      const vectors = (embeddingResponse as { data: number[][] }).data;

      if (!vectors || vectors.length !== batch.length) {
        errors.push(`Batch ${batchIndex}: embedding returned ${vectors?.length ?? 0} vectors for ${batch.length} texts`);
        continue;
      }

      embedded += vectors.length;

      // Step 2: Build Vectorize upsert payload
      const upsertPayload = batch.map((chunk, idx) => ({
        id: chunk.id,
        values: vectors[idx],
        metadata: {
          ...chunk.metadata,
          // Store the text in metadata so we can retrieve it during RAG
          text: chunk.text,
        },
      }));

      // Step 3: Upsert to Vectorize
      await env.VECTORIZE.upsert(upsertPayload);
      upserted += upsertPayload.length;

      console.log(`[Seed] Batch ${batchIndex}: ✓ ${upsertPayload.length} vectors upserted`);

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      errors.push(`Batch ${batchIndex}: ${msg}`);
      console.error(`[Seed] Batch ${batchIndex}: ✗ ${msg}`);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Seed] Complete: ${upserted}/${chunks.length} upserted in ${duration}ms. Errors: ${errors.length}`);

  return {
    total_chunks: chunks.length,
    embedded,
    upserted,
    errors,
    duration_ms: duration,
  };
}
