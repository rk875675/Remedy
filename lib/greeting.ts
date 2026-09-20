import { useEffect, useState } from 'react';

// Home greeting. Periods are local clock hours (device timezone), not UTC.
// To add or retune a slot, edit GREETING_PERIODS — first matching row wins.

export type GreetingNameUser = {
  id?: string;
  email?: string | null;
  user_metadata?: {
    full_name?: unknown;
    name?: unknown;
  } | null;
} | null | undefined;

type RememberedName = { userId: string; name: string };

let rememberedName: RememberedName | null = null;

/** Profile save writes here so Home can pick up the new name before the next RPC. */
export function rememberDisplayName(userId: string, name: string): void {
  const trimmed = name.trim();
  rememberedName = trimmed ? { userId, name: trimmed } : null;
}

export function clearRememberedDisplayName(): void {
  rememberedName = null;
}

function stringMeta(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Same resolution as Profile: saved display name, then a name just edited on
 * this device, then Apple/Google metadata, then the email local-part.
 */
export function resolveDisplayName(
  profileName: string | null | undefined,
  user: GreetingNameUser,
): string | null {
  const remembered =
    user?.id && rememberedName?.userId === user.id ? rememberedName.name : null;
  if (remembered) return remembered;

  const fromProfile = profileName?.trim();
  if (fromProfile) return fromProfile;

  const fromMeta =
    stringMeta(user?.user_metadata?.full_name) ??
    stringMeta(user?.user_metadata?.name);
  if (fromMeta) return fromMeta;

  const local = user?.email?.split('@')[0]?.trim();
  return local || null;
}

export type GreetingPeriod = {
  /** Inclusive local hour, 0–23. */
  from: number;
  /** Exclusive local hour, 0–23. `to <= from` wraps past midnight. */
  to: number;
  text: string;
};

export const GREETING_PERIODS: readonly GreetingPeriod[] = [
  { from: 5, to: 12, text: 'Good morning' },
  { from: 12, to: 17, text: 'Good afternoon' },
  { from: 17, to: 5, text: 'Good night' },
];

function hourInPeriod(hour: number, from: number, to: number): boolean {
  if (from < to) return hour >= from && hour < to;
  return hour >= from || hour < to;
}

export function getTimeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  const match = GREETING_PERIODS.find((p) => hourInPeriod(hour, p.from, p.to));
  return match?.text ?? GREETING_PERIODS[GREETING_PERIODS.length - 1].text;
}

export function firstNameFromDisplayName(
  displayName: string | null | undefined,
): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function formatHomeGreeting(
  displayName: string | null | undefined,
  now: Date = new Date(),
): string {
  const greeting = getTimeOfDayGreeting(now);
  const first = firstNameFromDisplayName(displayName);
  return first ? `${greeting}, ${first}` : greeting;
}

/** Recomputes on a one-minute tick so the line flips at period boundaries without a remount. */
export function useHomeGreetingParts(displayName: string | null | undefined): {
  greeting: string;
  firstName: string | null;
} {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return {
    greeting: getTimeOfDayGreeting(now),
    firstName: firstNameFromDisplayName(displayName),
  };
}

export function useHomeGreeting(displayName: string | null | undefined): string {
  const { greeting, firstName } = useHomeGreetingParts(displayName);
  return firstName ? `${greeting}, ${firstName}` : greeting;
}
