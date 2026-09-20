-- Legal acceptance ledger: evidence of which legal documents each user agreed
-- to, at which version, and when. Rows are written by the client after auth
-- (pre-signup acceptances are queued on-device and flushed on sign-in, keeping
-- the original tap-time in accepted_at). Insert-only: no update/delete policies,
-- so the ledger cannot be rewritten from the client.

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Random install marker generated on-device; ties pre-signup acceptances to
  -- the device they happened on. Not a hardware identifier.
  device_id text,
  document text not null check (
    document in ('terms', 'privacy', 'health_consent', 'disclaimer', 'age')
  ),
  -- Version label of the document that was accepted (e.g. '2026-08-18').
  document_version text not null,
  -- When the user actually tapped agree (client clock, may predate the row).
  accepted_at timestamptz not null,
  -- When the row landed on the server.
  recorded_at timestamptz not null default now()
);

comment on table public.legal_acceptances is
  'Insert-only ledger of user agreement to Terms, Privacy, health-data consent, medical disclaimer, and 18+ attestation.';

create index legal_acceptances_user_idx on public.legal_acceptances (user_id, document, accepted_at desc);

alter table public.legal_acceptances enable row level security;

create policy legal_acceptances_insert_own
  on public.legal_acceptances for insert
  with check (auth.uid() = user_id);

create policy legal_acceptances_select_own
  on public.legal_acceptances for select
  using (auth.uid() = user_id);

-- Intentionally no UPDATE or DELETE policies: acceptance evidence is immutable
-- from the client. Account deletion cascades via the auth.users FK.
