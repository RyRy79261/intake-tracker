import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { nutrientAnalysisTask } from "@/app/api/ai/nutrient-analysis/task";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it. The longest quality-tier deadline: a synthesis
// over weeks of food took 45 s at high effort in a live check.
export const maxDuration = 90;

export const POST = aiRoute(nutrientAnalysisTask, maxDuration);
