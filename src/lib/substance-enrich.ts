import { getUnenrichedSubstanceRecords, updateSubstanceRecord } from "./substance-service";

/**
 * Background AI enrichment runner (Pass 2) for historical substance records.
 *
 * Finds substance records that were created via keyword extraction during
 * the v12 migration (source='water_intake', aiEnriched=false) and sends
 * them to the Perplexity API for refined caffeine/alcohol estimates.
 *
 * Designed to be called once after app loads:
 * ```typescript
 * useEffect(() => {
 *   const timer = setTimeout(() => runSubstanceEnrichment(), 5000);
 *   return () => clearTimeout(timer);
 * }, []);
 * ```
 */
export async function runSubstanceEnrichment(): Promise<{
  enriched: number;
  failed: number;
  total: number;
}> {
  const records = await getUnenrichedSubstanceRecords();
  const total = records.length;
  let enriched = 0;
  let failed = 0;

  if (total === 0) {
    return { enriched: 0, failed: 0, total: 0 };
  }

  // Process in batches of 5 to avoid rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (record) => {
        try {
          const response = await fetch("/api/ai/substance-enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: record.description,
              type: record.type,
            }),
          });

          if (!response.ok) {
            // Skip on 422, 503, or other errors (best-effort)
            return { success: false as const, id: record.id };
          }

          const data = await response.json();

          if (record.type === "caffeine" && data.caffeineMg !== undefined) {
            await updateSubstanceRecord(record.id, {
              amountMg: data.caffeineMg,
              volumeMl: data.volumeMl,
              aiEnriched: true,
            });
            return { success: true as const, id: record.id };
          }

          if (record.type === "alcohol" && data.standardDrinks !== undefined) {
            await updateSubstanceRecord(record.id, {
              amountStandardDrinks: data.standardDrinks,
              volumeMl: data.volumeMl,
              aiEnriched: true,
            });
            return { success: true as const, id: record.id };
          }

          return { success: false as const, id: record.id };
        } catch {
          // Network error or other failure - skip this record
          return { success: false as const, id: record.id };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        enriched++;
      } else {
        failed++;
      }
    }

    // Add 1-second delay between batches to respect rate limits
    if (i + BATCH_SIZE < records.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`[SUBSTANCE-ENRICH] Completed: ${enriched} enriched, ${failed} failed, ${total} total`);
  return { enriched, failed, total };
}
