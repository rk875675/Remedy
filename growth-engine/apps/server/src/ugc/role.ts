export type StudioRole = "operator" | "creator";

export interface CreatorMap {
  slug: string;
  email: string;
}

export interface ResolvedIdentity {
  email: string;
  role: StudioRole;
  creatorSlug: string | null;
}

export function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function parseCreatorMap(raw: string): CreatorMap[] {
  const out: CreatorMap[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const slug = trimmed.slice(0, colon).trim().toLowerCase();
    const email = trimmed.slice(colon + 1).trim().toLowerCase();
    if (!slug || !email) continue;
    out.push({ slug, email });
  }
  return out;
}

export function resolveIdentity(
  emailRaw: string,
  operatorEmailsRaw: string,
  creatorsRaw: string,
): ResolvedIdentity {
  const email = emailRaw.trim().toLowerCase();
  const creators = parseCreatorMap(creatorsRaw);
  const matched = email ? creators.find((c) => c.email === email) : undefined;
  if (matched) {
    return { email, role: "creator", creatorSlug: matched.slug };
  }
  const operators = parseEmailList(operatorEmailsRaw);
  if (operators.length > 0 && email && !operators.includes(email)) {
    return { email, role: "creator", creatorSlug: null };
  }
  return { email, role: "operator", creatorSlug: null };
}

export function emailFromHeaders(headers: { get(name: string): string | null }): string {
  return (
    headers.get("Cf-Access-Authenticated-User-Email") ??
    headers.get("cf-access-authenticated-user-email") ??
    ""
  );
}
