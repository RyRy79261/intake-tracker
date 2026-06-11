import { NextResponse } from "next/server";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { withAuth } from "@/lib/auth-middleware";
import { sanitizeReportText } from "@/lib/security";
import { getClaudeClientForUser, CLAUDE_MODELS } from "@/app/api/ai/_shared/claude-client";
import { parseJsonBody, zodErrorResponse } from "@/app/api/_shared/validation";
import { createRateLimiter, getClientIp } from "@/app/api/_shared/rate-limit";
import { recordUsage, tokensFromAnthropic } from "@/app/api/ai/_shared/usage-tracker";
import { BUG_ISSUE_LABELS, FEATURE_ISSUE_LABELS } from "@/lib/github-labels";

/**
 * Files an in-app bug/feature report as a GitHub issue.
 *
 * Pipeline: validate → sanitize every field (PII redaction, defence in depth
 * over the client's own pass) → optionally let Claude restructure the prose
 * into title/summary/repro/expected/actual → assemble a markdown body with
 * collapsible diagnostics → create the issue via Octokit.
 *
 * AI is additive: if `useAi` is false, or no Anthropic key is configured, or
 * the model call fails, the report is filed from a plain template instead.
 */

const DEFAULT_REPO = "RyRy79261/intake-tracker";
const ISSUE_BODY_MAX = 60_000; // GitHub's hard limit is 65536.
const STACK_MAX_IN_BODY = 1_200;

const EnvFieldSchema = z.object({
  label: z.string().max(60),
  value: z.string().max(2000),
});

const ErrorLogSchema = z.object({
  timestamp: z.number(),
  source: z.string().max(40),
  message: z.string().max(4000),
  stack: z.string().max(8000).optional(),
  route: z.string().max(300).optional(),
});

const RequestSchema = z.object({
  type: z.enum(["bug", "feature"]),
  description: z.string().min(1, "Description is required").max(5000),
  transcript: z.string().max(5000).optional(),
  useAi: z.boolean(),
  diagnostics: z.object({
    environment: z.array(EnvFieldSchema).max(40),
    errorLogs: z.array(ErrorLogSchema).max(30),
  }),
});
type ReportRequest = z.infer<typeof RequestSchema>;
type ReportType = ReportRequest["type"];
type Diagnostics = ReportRequest["diagnostics"];

const StructuredSchema = z.object({
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(2000),
  stepsToReproduce: z.array(z.string().max(500)).max(20).optional(),
  expected: z.string().max(1000).optional(),
  actual: z.string().max(1000).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
});
type Structured = z.infer<typeof StructuredSchema>;

const FORMAT_TOOL = {
  name: "format_bug_report" as const,
  description:
    "Return a clean, structured GitHub issue built from the user's raw report.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Concise issue title, max ~100 chars. No leading '[Bug]' prefix.",
      },
      summary: {
        type: "string",
        description: "1-3 sentence summary of the problem or request.",
      },
      stepsToReproduce: {
        type: "array",
        items: { type: "string" },
        description: "Ordered reproduction steps. Omit for feature requests or if not given.",
      },
      expected: { type: "string", description: "What the user expected to happen." },
      actual: { type: "string", description: "What actually happened." },
      severity: {
        type: "string",
        enum: ["critical", "high", "medium", "low"],
        description: "A triage hint based only on the description. Optional.",
      },
    },
    required: ["title", "summary"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You convert a user's raw bug or feature report into a well-structured GitHub issue.

Rules:
- Be faithful to the user's report — never invent reproduction steps, symptoms, or facts they did not state.
- Write a concise, specific title (not "App is broken").
- For a bug: extract reproduction steps, expected behaviour, and actual behaviour IF the user provided them. Leave fields empty otherwise — do not guess.
- For a feature request: put the request in summary; leave stepsToReproduce/expected/actual empty.
- severity is a rough triage hint from the description alone (crash/data-loss = critical or high).
- The text has already been stripped of personal data; placeholders like [email] or [date] may appear — leave them as-is.
- Always call the format_bug_report tool. Never reply with prose only.`;

const rateLimiter = createRateLimiter(10);

type ToolUseBlock = Extract<Anthropic.Messages.ContentBlock, { type: "tool_use" }>;

function findToolUse(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string,
): ToolUseBlock | undefined {
  return content.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && b.name === toolName,
  );
}

/** Ask Claude to restructure the report. Returns null on any failure so the
 *  caller falls back to the plain template. */
async function structureWithAi(
  userId: string,
  email: string | undefined,
  type: ReportType,
  description: string,
): Promise<Structured | null> {
  let client;
  let resolved;
  try {
    ({ client, resolved } = await getClaudeClientForUser(userId, email));
  } catch {
    return null; // No key configured / key invalid — degrade to template.
  }

  const userMessage = `Report type: ${type}\n\nUser's raw report:\n"""\n${description}\n"""\n\nReturn a structured issue via the format_bug_report tool.`;

  try {
    const startedAt = Date.now();
    const response = await client.messages.create(
      {
        model: CLAUDE_MODELS.fast,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [FORMAT_TOOL],
        messages: [{ role: "user", content: userMessage }],
      },
      { timeout: 60_000 },
    );
    recordUsage({
      userId,
      keyOwnerId: resolved.keyOwnerId,
      keySource: resolved.source,
      provider: "anthropic",
      model: CLAUDE_MODELS.fast,
      route: "/api/bug-report",
      status: "success",
      durationMs: Date.now() - startedAt,
      ...tokensFromAnthropic(response.usage),
    });

    let toolBlock = findToolUse(response.content, FORMAT_TOOL.name);
    if (!toolBlock) {
      const followup = await client.messages.create(
        {
          model: CLAUDE_MODELS.fast,
          max_tokens: 1024,
          temperature: 0,
          system: SYSTEM_PROMPT,
          tools: [FORMAT_TOOL],
          tool_choice: { type: "tool", name: FORMAT_TOOL.name },
          messages: [
            { role: "user", content: userMessage },
            { role: "assistant", content: response.content },
            { role: "user", content: "Return the issue via the format_bug_report tool now." },
          ],
        },
        { timeout: 60_000 },
      );
      toolBlock = findToolUse(followup.content, FORMAT_TOOL.name);
    }
    if (!toolBlock) return null;

    const validated = StructuredSchema.safeParse(toolBlock.input);
    return validated.success ? validated.data : null;
  } catch (e) {
    console.error("[bug-report] AI structuring failed:", e);
    return null;
  }
}

function fenced(content: string): string {
  // Defuse any backtick fences inside the content so they can't break out.
  return "```\n" + content.replace(/```/g, "''' ") + "\n```";
}

function buildEnvironmentBlock(env: Diagnostics["environment"]): string {
  if (env.length === 0) return "";
  const lines = env
    .map((f) => `${sanitizeReportText(f.label, 60)}: ${sanitizeReportText(f.value, 2000)}`)
    .join("\n");
  return `\n<details>\n<summary>Environment</summary>\n\n${fenced(lines)}\n</details>\n`;
}

function buildLogsBlock(logs: Diagnostics["errorLogs"]): string {
  if (logs.length === 0) return "";
  const rendered = logs
    .map((l) => {
      const when = new Date(l.timestamp).toISOString();
      const head = `[${when}] [${l.source}]${l.route ? ` ${l.route}` : ""}`;
      const msg = sanitizeReportText(l.message, 4000);
      const stack = l.stack
        ? "\n" +
          sanitizeReportText(l.stack, STACK_MAX_IN_BODY)
            .split("\n")
            .map((s) => "  " + s)
            .join("\n")
        : "";
      return `${head}\n${msg}${stack}`;
    })
    .join("\n\n");
  return `\n<details>\n<summary>Recent error logs (${logs.length})</summary>\n\n${fenced(rendered)}\n</details>\n`;
}

function assembleBody(
  structured: Structured | null,
  rawDescription: string,
  type: ReportType,
  dictated: boolean,
  diagnostics: Diagnostics,
): { title: string; body: string } {
  let title: string;
  const parts: string[] = [];

  if (structured) {
    title = sanitizeReportText(structured.title, 140);
    parts.push(sanitizeReportText(structured.summary, 2000));
    if (structured.stepsToReproduce?.length) {
      parts.push(
        "## Steps to reproduce\n" +
          structured.stepsToReproduce
            .map((s, i) => `${i + 1}. ${sanitizeReportText(s, 500)}`)
            .join("\n"),
      );
    }
    if (structured.expected) {
      parts.push("## Expected\n" + sanitizeReportText(structured.expected, 1000));
    }
    if (structured.actual) {
      parts.push("## Actual\n" + sanitizeReportText(structured.actual, 1000));
    }
    if (structured.severity) {
      parts.push(`_Severity hint: ${structured.severity}_`);
    }
  } else {
    const firstLine = rawDescription.split("\n")[0]?.trim() ?? "";
    title =
      firstLine.slice(0, 100) ||
      (type === "bug" ? "Bug report" : "Feature request");
    parts.push("## Description\n" + rawDescription);
  }

  parts.push(
    `---\n_Filed via the in-app reporter${dictated ? " (voice-dictated)" : ""}. Diagnostics below are PII-sanitized._`,
  );
  parts.push(buildEnvironmentBlock(diagnostics.environment));
  parts.push(buildLogsBlock(diagnostics.errorLogs));

  const body = parts.filter(Boolean).join("\n\n").slice(0, ISSUE_BODY_MAX);
  return { title, body };
}

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const ip = getClientIp(request);
    if (!rateLimiter.check(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Bug reporting is not configured on the server (missing GITHUB_TOKEN).",
          code: "NO_GITHUB_TOKEN",
        },
        { status: 503 },
      );
    }

    const json = await parseJsonBody(request);
    if (!json.ok) return json.response;
    const parsed = RequestSchema.safeParse(json.body);
    if (!parsed.success) {
      return zodErrorResponse("bug-report request invalid", parsed.error);
    }
    const { type, description, transcript, useAi, diagnostics } = parsed.data;

    console.log(`[AUDIT] bug-report (${type}) from user: ${auth.userId}`);

    // Sanitize the user's prose before it touches AI, GitHub, or logs.
    const safeDescription = sanitizeReportText(description, 5000);
    if (!safeDescription) {
      return NextResponse.json(
        { error: "Description is empty after sanitization" },
        { status: 400 },
      );
    }

    const structured = useAi
      ? await structureWithAi(auth.userId!, auth.email, type, safeDescription)
      : null;

    const { title, body } = assembleBody(
      structured,
      safeDescription,
      type,
      Boolean(transcript),
      diagnostics,
    );

    const repoSlug = process.env.GITHUB_REPO || DEFAULT_REPO;
    const segments = repoSlug.trim().split("/");
    const owner = segments[0]?.trim();
    const repo = segments[1]?.trim();
    if (segments.length !== 2 || !owner || !repo) {
      return NextResponse.json(
        { error: "Server GITHUB_REPO is misconfigured", code: "BAD_REPO" },
        { status: 503 },
      );
    }

    const octokit = new Octokit({ auth: token });
    try {
      const { data } = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels: [...(type === "bug" ? BUG_ISSUE_LABELS : FEATURE_ISSUE_LABELS)],
      });
      return NextResponse.json({ url: data.html_url, number: data.number });
    } catch (e) {
      // Octokit throws a RequestError carrying a numeric `status`.
      const status =
        e && typeof e === "object" && typeof (e as { status?: unknown }).status === "number"
          ? (e as { status: number }).status
          : undefined;
      if (status !== undefined) {
        console.error(`[bug-report] GitHub ${status}:`, e);
        if (status === 401) {
          return NextResponse.json(
            { error: "GitHub rejected the token. Check GITHUB_TOKEN.", code: "BAD_TOKEN" },
            { status: 502 },
          );
        }
        if (status === 403 || status === 404) {
          return NextResponse.json(
            {
              error:
                "GitHub token lacks Issues access to the repository, or the repo is unreachable.",
              code: "NO_ACCESS",
            },
            { status: 502 },
          );
        }
        if (status === 410) {
          return NextResponse.json(
            { error: "Issues are disabled on the target repository.", code: "ISSUES_DISABLED" },
            { status: 502 },
          );
        }
      }
      throw e;
    }
  } catch (error) {
    console.error("bug-report error:", error);
    return NextResponse.json(
      { error: "Failed to file the bug report" },
      { status: 502 },
    );
  }
});
