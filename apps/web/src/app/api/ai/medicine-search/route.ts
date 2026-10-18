import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { medicineSearchTask } from "@/app/api/ai/medicine-search/task";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it. An accurate answer matters more here than a fast
// one: at high effort a lookup took up to 77 s in a live check (#336),
// almost all of it web search, so 80 s left no margin (#415).
export const maxDuration = 130;

export const POST = aiRoute(medicineSearchTask, maxDuration);
