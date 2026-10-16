import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { insightsTask } from "@/app/api/analytics/insights/task";

export const runtime = "nodejs";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it.
export const maxDuration = 90;

export const POST = aiRoute(insightsTask, maxDuration);
