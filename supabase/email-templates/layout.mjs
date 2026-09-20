/**
 * Shared Remedy auth-email chrome. Table + inline CSS so Gmail / Apple Mail
 * render it. Use renderAuthEmail() for every future transactional email.
 *
 * Product name in From + header is always "Remedy" — never "Remedy Recoveries".
 * Legal entity lives in constants/legalTerms.ts (LEGAL_ENTITY). When that
 * company name changes, update `entity` here in the same pass.
 */

export const BRAND = {
  name: 'Remedy',
  entity: 'Kumar Holdings LLC, d/b/a Remedy',
  address: '8209 W 127th Cir, Overland Park, KS 66213, USA',
  supportEmail: 'social@remedyrecoveries.com',
  fromEmail: 'hello@send.remedyrecoveries.com',
  fromName: 'Remedy',
  logoUrl: 'https://remedyrecoveries.com/assets/logo.png',
  siteUrl: 'https://remedyrecoveries.com',
  privacyUrl: 'https://remedyrecoveries.com/privacy',
  termsUrl: 'https://remedyrecoveries.com/terms',
  unsubscribeUrl: 'https://remedyrecoveries.com/unsubscribe',
  primary: '#3E6B4E',
  primaryDeep: '#2F5440',
  background: '#FAF7F4',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  muted: '#6B6B6B',
  tertiary: '#B3ABA5',
  border: '#E8E0DC',
};

const AUTH_REDIRECT =
  'https://vgqmvekjttywwadpftre.supabase.co/functions/v1/auth-redirect';

export function authRedirectHref(type) {
  return `${AUTH_REDIRECT}?token_hash={{ .TokenHash }}&type=${type}`;
}

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   preheader: string,
 *   title: string,
 *   bodyHtml: string,
 *   ctaLabel: string,
 *   ctaHref: string,
 *   reason: string,
 * }} opts
 */
export function renderAuthEmail(opts) {
  const { preheader, title, bodyHtml, ctaLabel, ctaHref, reason } = opts;
  const b = BRAND;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${b.background};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${b.background};padding:32px 12px 48px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 8px 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${b.logoUrl}" width="36" height="36" alt="" style="display:block;border-radius:9px;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;font-weight:700;color:${b.text};">
                    ${b.name}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${b.surface};border:1px solid ${b.border};border-radius:16px;padding:32px 28px 28px;">
              <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:32px;font-weight:700;color:${b.text};">
                ${title}
              </h1>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:24px;color:${b.muted};">
                ${bodyHtml}
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px;">
                <tr>
                  <td style="background:${b.primary};border-radius:12px;">
                    <a href="${escapeAttr(ctaHref)}" style="display:inline-block;padding:14px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:${b.tertiary};">
                If the button doesn’t work, copy and paste this link:<br />
                <a href="${escapeAttr(ctaHref)}" style="color:${b.primaryDeep};word-break:break-all;">${ctaHref}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${b.tertiary};">
              <p style="margin:0 0 10px;color:${b.muted};">${reason}</p>
              <p style="margin:0 0 10px;">${b.entity}<br />${b.address}</p>
              <p style="margin:0 0 10px;">
                <a href="${b.privacyUrl}" style="color:${b.primaryDeep};text-decoration:underline;">Privacy</a>
                &nbsp;·&nbsp;
                <a href="${b.termsUrl}" style="color:${b.primaryDeep};text-decoration:underline;">Terms</a>
                &nbsp;·&nbsp;
                <a href="${b.unsubscribeUrl}" style="color:${b.primaryDeep};text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="mailto:${b.supportEmail}" style="color:${b.primaryDeep};text-decoration:underline;">Contact</a>
              </p>
              <p style="margin:0;">Account emails (sign-in, confirmation, password reset) still send after an unsubscribe so you can reach your account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function confirmationEmail() {
  return renderAuthEmail({
    preheader: 'Confirm your email to finish creating your Remedy account.',
    title: 'Confirm your email',
    bodyHtml:
      '<p style="margin:0 0 12px;">Thanks for creating a Remedy account. Tap the button below to confirm this email address and continue.</p><p style="margin:0;">This link expires shortly and can only be used once.</p>',
    ctaLabel: 'Confirm email',
    ctaHref: authRedirectHref('signup'),
    reason: 'You received this because this email was used to create a Remedy account. If that wasn’t you, you can ignore this message.',
  });
}

export function recoveryEmail() {
  return renderAuthEmail({
    preheader: 'Reset your Remedy password with this one-time link.',
    title: 'Reset your password',
    bodyHtml:
      '<p style="margin:0 0 12px;">We got a request to reset the password for your Remedy account. Tap the button below to choose a new one.</p><p style="margin:0;">If you didn’t ask for this, you can ignore this email. Your password stays the same.</p>',
    ctaLabel: 'Reset password',
    ctaHref: authRedirectHref('recovery'),
    reason: 'You received this because a password reset was requested for this Remedy account.',
  });
}

export function magicLinkEmail() {
  return renderAuthEmail({
    preheader: 'Your one-time Remedy sign-in link.',
    title: 'Sign in to Remedy',
    bodyHtml:
      '<p style="margin:0 0 12px;">Tap the button below to sign in. This link expires shortly and can only be used once.</p><p style="margin:0;">If you didn’t ask to sign in, you can ignore this email.</p>',
    ctaLabel: 'Sign in',
    ctaHref: authRedirectHref('magiclink'),
    reason: 'You received this because a sign-in was requested for this Remedy account.',
  });
}

export function emailChangeEmail() {
  return renderAuthEmail({
    preheader: 'Confirm your new email address for Remedy.',
    title: 'Confirm your new email',
    bodyHtml:
      '<p style="margin:0 0 12px;">Confirm <strong>{{ .NewEmail }}</strong> as the new email for your Remedy account.</p><p style="margin:0;">If you didn’t request this change, you can ignore this email.</p>',
    ctaLabel: 'Confirm new email',
    ctaHref: authRedirectHref('email_change'),
    reason: 'You received this because an email-address change was requested on a Remedy account.',
  });
}

export function inviteEmail() {
  return renderAuthEmail({
    preheader: 'You’ve been invited to create a Remedy account.',
    title: 'You’re invited to Remedy',
    bodyHtml:
      '<p style="margin:0 0 12px;">You’ve been invited to create a Remedy account. Tap the button below to accept and set your password.</p>',
    ctaLabel: 'Accept invitation',
    ctaHref: authRedirectHref('invite'),
    reason: 'You received this because someone invited this email to Remedy.',
  });
}

export const SUBJECTS = {
  confirmation: 'Confirm your Remedy email',
  recovery: 'Reset your Remedy password',
  magic_link: 'Your Remedy sign-in link',
  email_change: 'Confirm your new Remedy email',
  invite: 'You’re invited to Remedy',
};
