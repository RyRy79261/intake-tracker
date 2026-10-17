import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { parseTask } from "@/app/api/ai/parse/task";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it.
export const maxDuration = 60;

export const POST = aiRoute(parseTask, maxDuration);
