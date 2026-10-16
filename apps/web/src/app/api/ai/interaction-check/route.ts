import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { interactionCheckTask } from "@/app/api/ai/interaction-check/task";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it.
export const maxDuration = 60;

export const POST = aiRoute(interactionCheckTask, maxDuration);
