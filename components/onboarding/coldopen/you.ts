/** A typed first name, or null when they skipped or left it blank. */
export function trimmedName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** After they share their name. No name still has a full sentence. */
export function favouriteHumanLine(firstName: string | null): string {
  if (firstName) return `${firstName}! My new favourite human.`;
  return 'My new favourite human.';
}
