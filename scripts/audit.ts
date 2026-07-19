/**
 * Remedy multi-agent critical-bug audit.
 *
 * Spawns 8 parallel Composer 2.5 cloud agents, each owning one domain.
 * Outputs structured findings to stdout; optionally posts to Slack when
 * SLACK_BOT_TOKEN + SLACK_ALERTS_CHANNEL_ID are set.
 *
 * Usage:
 *   CURSOR_API_KEY=cursor_... npx tsx scripts/audit.ts
 *
 * Optional env:
 *   SLACK_BOT_TOKEN       - bot token with chat:write scope
 *   SLACK_ALERTS_CHANNEL_ID - e.g. C012AB3CD (#remedy-alerts channel ID)
 */

import { Agent } from "@cursor/sdk";

const REPO = "rk875675/remedy";
const API_KEY = process.env.CURSOR_API_KEY;
if (!API_KEY) {
  console.error("CURSOR_API_KEY is not set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Domain definitions — maps exactly to the spec in the previous chat
// ---------------------------------------------------------------------------
const DOMAINS = [
  {
    name: "Auth & Security",
    scope: [
      "app/(auth)/",
      "context/AuthContext.tsx",
      "lib/supabase.ts",
      "supabase/functions/auth-bridge/",
    ],
    focus:
      "Session leaks, token handling, missing auth guards, RLS bypass surface",
  },
  {
    name: "IAP & Payments",
    scope: [
      "lib/iap.ts",
      "lib/entitlements.ts",
      "lib/pendingPurchase.ts",
      "context/PremiumContext.tsx",
      "supabase/functions/verify-purchase/",
      "supabase/functions/restore-purchases/",
    ],
    focus:
      "Receipt validation gaps, entitlement race conditions, restore edge cases, StoreKit error handling",
  },
  {
    name: "Edge Functions",
    scope: ["supabase/functions/", "lib/ratelimit.ts", "supabase/functions/_shared/"],
    focus:
      "Missing auth checks, rate limit bypass, unhandled Deno errors, CORS misconfiguration, secret exposure",
  },
  {
    name: "Data Layer",
    scope: [
      "types/database.ts",
      "lib/schemas.ts",
      "lib/supabase.ts",
    ],
    focus:
      "N+1 queries, missing .single() error handling, optimistic update races, type mismatches vs DB schema",
  },
  {
    name: "Session Player",
    scope: [
      "app/session/[id].tsx",
      "app/(tabs)/index.tsx",
      "lib/streak.ts",
    ],
    focus:
      "Video load failures, completion logic edge cases, week offset bugs, null crashes",
  },
  {
    name: "Onboarding & Plan Assignment",
    scope: [
      "app/(onboarding)/",
      "context/OnboardingContext.tsx",
      "supabase/functions/assign-program/",
    ],
    focus:
      "Incomplete onboarding states, plan assignment failures, re-entry handling",
  },
  {
    name: "State & Context",
    scope: [
      "context/",
      "app/_layout.tsx",
      "app/(tabs)/_layout.tsx",
    ],
    focus:
      "Stale closures, missing cleanup on unmount, navigation state mismatches, double-render side effects",
  },
  {
    name: "UI Crash Surface",
    scope: [
      "components/",
      "app/(tabs)/progress.tsx",
      "app/(tabs)/profile.tsx",
    ],
    focus:
      "Null renders, missing loading guards, chart library crashes on empty data, safe area edge cases",
  },
] as const;

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------
function buildPrompt(domain: (typeof DOMAINS)[number]): string {
  return `You are doing a focused critical-bug audit of the Remedy iOS app (React Native + Expo + Supabase).

DOMAIN: ${domain.name}
FILES IN SCOPE: ${domain.scope.join(", ")}
WHAT TO LOOK FOR: ${domain.focus}

Read every file in scope. For each real bug or risk you find, output a line in EXACTLY this format:
  CRITICAL: [filename:line] <one-sentence problem> — <one-sentence fix>
  WARNING:  [filename:line] <one-sentence problem> — <one-sentence fix>
  NOTE:     [filename:line] <one-sentence problem> — <one-sentence fix>

Rules:
- Only report ${domain.name} domain issues — ignore everything else.
- Use CRITICAL for bugs that can cause data loss, auth bypass, crashes, or revenue loss.
- Use WARNING for issues that will cause wrong behaviour under realistic conditions.
- Use NOTE for latent risks or code smells worth tracking.
- If you find nothing noteworthy, output: CLEAN: no issues found in ${domain.name}
- Do NOT include explanations, headers, or markdown outside the format above.`;
}

// ---------------------------------------------------------------------------
// Run all 8 agents in parallel
// ---------------------------------------------------------------------------
async function runAudit() {
  console.log(`Starting audit across ${DOMAINS.length} domains in parallel…\n`);

  const start = Date.now();

  const settled = await Promise.allSettled(
    DOMAINS.map(async (domain) => {
      const result = await Agent.prompt(buildPrompt(domain), {
        apiKey: API_KEY!,
        model: { id: "composer-2.5" },
        cloud: {
          repos: [{ repoName: REPO }],
        },
      });

      if (result.status === "error") {
        throw new Error(`Agent run failed for ${domain.name}: ${result.id}`);
      }

      return { domain: domain.name, output: result.result ?? "" };
    })
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  const findings: string[] = [];
  const errors: string[] = [];

  for (const [i, outcome] of settled.entries()) {
    const domainName = DOMAINS[i].name;
    if (outcome.status === "fulfilled") {
      findings.push(`=== ${domainName} ===\n${outcome.value.output}`);
    } else {
      errors.push(`${domainName}: ${outcome.reason}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Build summary
  // ---------------------------------------------------------------------------
  const criticalCount = findings.join("\n").match(/^CRITICAL:/gm)?.length ?? 0;
  const warningCount  = findings.join("\n").match(/^WARNING:/gm)?.length  ?? 0;
  const noteCount     = findings.join("\n").match(/^NOTE:/gm)?.length     ?? 0;

  const header = [
    `BUGS_SUMMARY: Remedy audit complete in ${elapsed}s`,
    `CRITICAL: ${criticalCount}  WARNING: ${warningCount}  NOTE: ${noteCount}`,
    errors.length ? `⚠️  ${errors.length} domain(s) failed: ${errors.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fullReport = [header, "", ...findings].join("\n\n");

  console.log(fullReport);

  // ---------------------------------------------------------------------------
  // Optional Slack post
  // ---------------------------------------------------------------------------
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const slackChannel = process.env.SLACK_ALERTS_CHANNEL_ID;

  if (slackToken && slackChannel) {
    await postToSlack(slackToken, slackChannel, fullReport);
  } else {
    console.log(
      "\n(Set SLACK_BOT_TOKEN + SLACK_ALERTS_CHANNEL_ID to auto-post to #remedy-alerts)"
    );
  }
}

async function postToSlack(token: string, channel: string, text: string) {
  // Slack has a 40k char limit per message; chunk if needed
  const MAX = 38000;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX) {
    chunks.push(text.slice(i, i + MAX));
  }

  for (const chunk of chunks) {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text: "```\n" + chunk + "\n```" }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      console.error("Slack post failed:", json.error);
    } else {
      console.log("Posted chunk to Slack OK");
    }
  }
}

runAudit().catch((err) => {
  console.error(err);
  process.exit(1);
});
