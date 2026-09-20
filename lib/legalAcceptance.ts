// Legal acceptance ledger.
//
// Acceptances happen while the user is still anonymous (the safety/consent gate
// runs before signup), so they are queued in AsyncStorage at tap-time and
// flushed to the `legal_acceptances` table once a session exists. The queued
// `accepted_at` preserves the real moment of consent; `recorded_at` (DB default)
// marks when the row landed. Rows are insert-only evidence — never updated.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/** Bump when the Terms, Privacy Policy, or consent/disclaimer copy materially changes. */
export const LEGAL_DOCS_VERSION = '2026-09-19';

export type LegalDocumentKind = 'terms' | 'privacy' | 'health_consent' | 'disclaimer' | 'age';

type QueuedAcceptance = {
  document: LegalDocumentKind;
  document_version: string;
  accepted_at: string;
  device_id: string;
};

const QUEUE_KEY = 'remedy.legalAcceptanceQueue';
const DEVICE_ID_KEY = 'remedy.legalDeviceId';

/** Stable random install marker so pre-signup acceptances can be tied to a device. */
async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
  } catch {
    // Fall through to generate a fresh one.
  }
  const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, generated);
  } catch {
    // Non-fatal: the marker just won't be stable across launches.
  }
  return generated;
}

async function readQueue(): Promise<QueuedAcceptance[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedAcceptance =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as QueuedAcceptance).document === 'string' &&
        typeof (item as QueuedAcceptance).document_version === 'string' &&
        typeof (item as QueuedAcceptance).accepted_at === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * Record acceptance of one or more legal documents at the moment the user taps
 * agree. Safe to call while signed out; rows are flushed to the server after auth.
 */
export async function recordLegalAcceptances(
  documents: LegalDocumentKind[],
  version: string = LEGAL_DOCS_VERSION,
): Promise<void> {
  if (documents.length === 0) return;
  const deviceId = await getDeviceId();
  const acceptedAt = new Date().toISOString();
  const additions: QueuedAcceptance[] = documents.map((document) => ({
    document,
    document_version: version,
    accepted_at: acceptedAt,
    device_id: deviceId,
  }));
  const queue = await readQueue();
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, ...additions]));
  } catch {
    // Best-effort: losing the local queue loses evidence, not functionality.
  }
}

/**
 * Push any queued acceptances to the server under the signed-in user. Called
 * from AuthContext whenever a session appears. Failures keep the queue intact
 * for the next attempt.
 */
export async function flushLegalAcceptances(userId: string): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;
  const { error } = await supabase.from('legal_acceptances').insert(
    queue.map((item) => ({
      user_id: userId,
      device_id: item.device_id,
      document: item.document,
      document_version: item.document_version,
      accepted_at: item.accepted_at,
    })),
  );
  if (!error) {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
      // A duplicate flush later just adds redundant evidence rows.
    }
  }
}
