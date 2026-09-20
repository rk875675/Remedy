/**
 * Pushes branded auth email templates + sender identity to the linked project.
 * Run from repo root: node supabase/email-templates/push.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND,
  SUBJECTS,
  confirmationEmail,
  recoveryEmail,
  magicLinkEmail,
  emailChangeEmail,
  inviteEmail,
} from './layout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(root, '.env.local');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const token = env.SUPABASE_ACCESS_TOKEN;
const ref = 'vgqmvekjttywwadpftre';
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const body = {
  smtp_admin_email: BRAND.fromEmail,
  smtp_sender_name: BRAND.fromName,
  mailer_subjects_confirmation: SUBJECTS.confirmation,
  mailer_subjects_recovery: SUBJECTS.recovery,
  mailer_subjects_magic_link: SUBJECTS.magic_link,
  mailer_subjects_email_change: SUBJECTS.email_change,
  mailer_subjects_invite: SUBJECTS.invite,
  mailer_templates_confirmation_content: confirmationEmail(),
  mailer_templates_recovery_content: recoveryEmail(),
  mailer_templates_magic_link_content: magicLinkEmail(),
  mailer_templates_email_change_content: emailChangeEmail(),
  mailer_templates_invite_content: inviteEmail(),
};

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error('PATCH failed', res.status, await res.text());
  process.exit(1);
}

const c = await res.json();
console.log(
  JSON.stringify(
    {
      smtp_admin_email: c.smtp_admin_email,
      smtp_sender_name: c.smtp_sender_name,
      mailer_subjects_confirmation: c.mailer_subjects_confirmation,
      mailer_subjects_recovery: c.mailer_subjects_recovery,
      confirmation_len: (c.mailer_templates_confirmation_content || '').length,
      recovery_len: (c.mailer_templates_recovery_content || '').length,
    },
    null,
    2,
  ),
);
