import { aiRoute } from "@/app/api/ai/_shared/ai-task";
import { voiceParseTask } from "@/app/api/ai/voice-parse/task";

// Vercel function limit, read statically by Next.js. The task deadline
// stops 10 s short of it. The user is waiting after speaking; a full
// 4096-token reply is well inside this.
export const maxDuration = 60;

export const POST = aiRoute(voiceParseTask, maxDuration);
