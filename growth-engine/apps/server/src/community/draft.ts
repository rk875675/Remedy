import { z } from "zod";
import { env } from "../config.js";

const PLATFORMS = ["tiktok", "instagram", "facebook", "youtube", "x"] as const;
export type CommunityPlatform = (typeof PLATFORMS)[number];

const DraftSchema = z
  .object({
    skip: z.boolean(),
    reason: z.string().max(240),
    reply: z.string().max(280),
  })
  .strict();

export type CommunityDraft = z.infer<typeof DraftSchema>;

const SYSTEM = `You draft public replies for Remedy's official social account.
Remedy is a back-pain rehab app: short guided sessions, not a clinic and not a doctor.

Rules:
- Sound like a calm person on the brand account. One or two short sentences.
- Helpful and specific to what they said. No hashtags, no emoji, no "link in bio", no hard sell.
- Never diagnose, name a condition, prescribe exercises, or tell someone to stop care they already have.
- If they describe numbness, weakness, bowel or bladder changes, pain after a fall, fever, or pain that keeps getting worse, skip and say a clinician should see them. Do not draft a rehab tip.
- If the comment is off-topic, abusive, a medical emergency, or you would need their history to answer, set skip true and leave reply empty.
- You may mention Remedy only when they asked what the account is or what to do next. One plain clause, not a pitch.
- Return JSON only: {"skip": boolean, "reason": string, "reply": string}`;

export function parseCommunityArgs(argv: string[]): { platform: CommunityPlatform; text: string } {
  const platformFlag = argv.indexOf("--platform");
  const raw = platformFlag >= 0 ? argv[platformFlag + 1] : "tiktok";
  const platform = PLATFORMS.find((p) => p === raw);
  if (!platform) throw new Error(`Platform must be one of: ${PLATFORMS.join(", ")}`);
  const text = argv.filter((a, i) => a !== "--platform" && i !== platformFlag + 1).join(" ").trim();
  if (text.length < 2) throw new Error("Paste the comment after the command.");
  if (text.length > 2000) throw new Error("Comment is too long.");
  return { platform, text };
}

export async function draftCommunityReply(platform: CommunityPlatform, comment: string): Promise<CommunityDraft> {
  if (!env.XAI_API_KEY) {
    throw new Error("Set XAI_API_KEY in growth-engine/.env. Drafts stay local until you post them yourself.");
  }
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.XAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Platform: ${platform}\nComment:\n${comment}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`xAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("xAI returned an empty draft.");
  const parsed = DraftSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error("xAI draft failed schema check.");
  return parsed.data;
}
