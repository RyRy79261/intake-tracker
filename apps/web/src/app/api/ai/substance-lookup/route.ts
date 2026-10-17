import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { substanceLookupTask } from "@/app/api/ai/substance-lookup/task";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it, so a slow search-and-answer turn ends in a JSON
// 504 rather than the platform's own.
export const maxDuration = 60;

export const POST = aiRoute(substanceLookupTask, maxDuration);
