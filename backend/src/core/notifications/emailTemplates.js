import { env } from '../../config/env.js';

/*
 * Branded HTML emails (with a plain-text twin). Built for email clients, not browsers: table layout, inline styles,
 * web-safe fonts, a 600px column that shrinks on phones, and a solid-colour button that renders in Outlook too.
 * Palette follows the app: ink #171717, gold #C9A227 / #9C7A16, cream #F7F3E8.
 */

const C = {
  page: '#F4F1EA',
  ink: '#171717',
  body: '#4A4740',
  muted: '#8C877C',
  line: '#E6E1D3',
  cream: '#FBF8EF',
  gold: '#C9A227',
  goldDark: '#9C7A16',
  card: '#FFFFFF',
};
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ---------------------------------------------------------------- building blocks

const paragraph = (html) => `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.65;color:${C.body};">${html}</p>`;

/** The one-time code as separate digit tiles (easy to read, hard to mistype). */
function otpBlock(code, caption) {
  const cells = String(code)
    .split('')
    .map(
      (d) =>
        `<td align="center" valign="middle" style="width:46px;height:58px;background:${C.cream};border:1px solid ${C.line};border-radius:10px;font-family:${MONO};font-size:28px;font-weight:700;color:${C.ink};">${esc(d)}</td>`,
    )
    .join('<td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>');
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 10px;">
  <tr>${cells}</tr>
</table>
<p style="margin:0 0 24px;text-align:center;font-family:${SANS};font-size:12px;letter-spacing:0.04em;color:${C.muted};">${caption}</p>`;
}

/** A solid gold button (VML-free: a padded table cell is what every client agrees on). */
function button(label, href) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px;">
  <tr>
    <td align="center" bgcolor="${C.gold}" style="border-radius:10px;background:${C.gold};box-shadow:0 6px 16px rgba(156,122,22,0.28);">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:10px;letter-spacing:0.01em;">${esc(label)}&nbsp;&rarr;</a>
    </td>
  </tr>
</table>`;
}

/** Label / value pairs in a soft panel. */
function details(rows) {
  const body = rows
    .filter(([, v]) => v)
    .map(
      ([label, value], i) => `
  <tr>
    <td style="padding:12px 18px;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${SANS};font-size:13px;color:${C.muted};width:38%;">${esc(label)}</td>
    <td style="padding:12px 18px;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${SANS};font-size:14px;font-weight:600;color:${C.ink};word-break:break-word;">${value}</td>
  </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${C.cream};border:1px solid ${C.line};border-radius:12px;border-collapse:separate;">${body}</table>`;
}

/** A quiet note with a gold rule on the left (security reminders). */
const note = (html) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td style="border-left:3px solid ${C.gold};padding:4px 0 4px 14px;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};">${html}</td></tr></table>`;

/** A link written out in full, for clients that block buttons. */
const fallbackLink = (href) =>
  `<p style="margin:0 0 20px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">Button not working? Copy this link into your browser:<br><a href="${esc(href)}" style="color:${C.goldDark};word-break:break-all;">${esc(href)}</a></p>`;

/** The page: header with the brand, the card, the footer. `preheader` is the inbox preview line. */
function layout({ preheader, eyebrow, title, body, footerNote }) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<style>
  @media (max-width: 620px) {
    .container { width: 100% !important; }
    .card { padding: 28px 22px !important; }
    .title { font-size: 23px !important; }
  }
  a { color: ${C.goldDark}; }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;&#8202;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <!-- Brand bar -->
        <tr>
          <td bgcolor="${C.ink}" style="background:${C.ink};border-radius:16px 16px 0 0;padding:22px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="width:34px;height:34px;background:${C.gold};border-radius:9px;text-align:center;vertical-align:middle;font-family:${SERIF};font-size:18px;color:${C.ink};">&#9670;</td>
              <td style="padding-left:12px;font-family:${SERIF};font-size:20px;letter-spacing:0.02em;color:#F7F3E8;">${esc(env.APP_NAME)}</td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:3px;line-height:3px;font-size:0;background:${C.gold};background-image:linear-gradient(90deg,#E9CF6E,#C9A227 55%,#A8841B);">&nbsp;</td></tr>
        <!-- Card -->
        <tr>
          <td class="card" bgcolor="${C.card}" style="background:${C.card};border-radius:0 0 16px 16px;padding:40px 44px 36px;box-shadow:0 12px 32px rgba(23,23,23,0.06);">
            <p style="margin:0 0 10px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.goldDark};">${esc(eyebrow)}</p>
            <h1 class="title" style="margin:0 0 20px;font-family:${SERIF};font-size:27px;line-height:1.25;font-weight:600;color:${C.ink};">${esc(title)}</h1>
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding:24px 24px 8px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">
            ${footerNote ? `${footerNote}<br>` : ''}This is an automatic message from ${esc(env.APP_NAME)} — replies are not read.<br>&copy; ${year} ${esc(env.APP_NAME)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

const textFooter = () => `\n\n—\nThis is an automatic message from ${env.APP_NAME}.`;

// ---------------------------------------------------------------- templates

export const templates = {
  /** A new organisation's login: the 6-digit code is its first password. */
  organisationWelcome: ({ name, organisationName, email, otp, loginUrl }) => ({
    subject: `Welcome to ${env.APP_NAME} — your sign-in code for ${organisationName}`,
    html: layout({
      preheader: `Your account for ${organisationName} is ready. Sign in with this 6-digit code.`,
      eyebrow: 'Welcome aboard',
      title: 'Your account is ready',
      body: [
        paragraph(`Hello ${esc(name)},`),
        paragraph(`<strong style="color:${C.ink};">${esc(organisationName)}</strong> has been set up on ${esc(env.APP_NAME)}. Use the code below as your password to sign in for the first time.`),
        otpBlock(otp, 'YOUR ONE-TIME PASSWORD'),
        details([
          ['Organisation', esc(organisationName)],
          ['Login email', esc(email)],
          ['Password', `<span style="font-family:${MONO};letter-spacing:0.12em;">${esc(otp)}</span>`],
        ]),
        button(`Sign in to ${env.APP_NAME}`, loginUrl),
        note('For your security you will be asked to choose your own password right after signing in. Never share this code — our team will never ask for it.'),
      ].join(''),
      footerNote: `You received this because an account was created for ${esc(email)}.`,
    }),
    text: `Hello ${name},\n\n${organisationName} has been set up on ${env.APP_NAME}.\n\nSign in with:\n  Email:    ${email}\n  Password: ${otp}\n\n${loginUrl}\n\nYou will be asked to choose your own password after signing in. Never share this code.${textFooter()}`,
  }),

  /** Super Admin sent a fresh code: it replaces the organisation's password. */
  loginOtp: ({ name, organisationName, email, otp, loginUrl }) => ({
    subject: `Your new ${env.APP_NAME} sign-in code`,
    html: layout({
      preheader: `A new 6-digit sign-in code for ${organisationName}.`,
      eyebrow: 'New sign-in code',
      title: 'Here is your new password',
      body: [
        paragraph(`Hello ${esc(name)},`),
        paragraph(`A new one-time password was issued for <strong style="color:${C.ink};">${esc(organisationName)}</strong>. Your previous password no longer works, and any open sessions have been signed out.`),
        otpBlock(otp, 'YOUR NEW ONE-TIME PASSWORD'),
        details([
          ['Login email', esc(email)],
          ['Password', `<span style="font-family:${MONO};letter-spacing:0.12em;">${esc(otp)}</span>`],
        ]),
        button('Sign in now', loginUrl),
        note('You will be asked to choose your own password after signing in. If you did not expect this email, contact your administrator.'),
      ].join(''),
    }),
    text: `Hello ${name},\n\nA new one-time password was issued for ${organisationName}. Your previous password no longer works.\n\n  Email:    ${email}\n  Password: ${otp}\n\n${loginUrl}${textFooter()}`,
  }),

  /** Forgot password: a link that lets the owner of the email choose a new password. */
  passwordReset: ({ name, link, minutes }) => ({
    subject: `Reset your ${env.APP_NAME} password`,
    html: layout({
      preheader: `Choose a new password. The link expires in ${minutes} minutes.`,
      eyebrow: 'Account security',
      title: 'Reset your password',
      body: [
        paragraph(`Hello ${esc(name)},`),
        paragraph(`We received a request to reset the password for your ${esc(env.APP_NAME)} account. Click the button below to choose a new one.`),
        button('Reset password', link),
        details([['Link expires in', `${esc(minutes)} minutes`]]),
        fallbackLink(link),
        note('Didn’t ask for this? You can safely ignore this email — your password stays the same and the link expires on its own.'),
      ].join(''),
    }),
    text: `Hello ${name},\n\nUse the link below to reset your ${env.APP_NAME} password. It expires in ${minutes} minutes.\n\n${link}\n\nIf you did not request this, you can ignore this email.${textFooter()}`,
  }),

  /** Super Admin's "send test email" from the SMTP settings page. */
  smtpTest: ({ host, fromEmail, sentBy }) => ({
    subject: `${env.APP_NAME} — test email`,
    html: layout({
      preheader: 'Your email settings are working.',
      eyebrow: 'Email settings',
      title: 'Your email settings work',
      body: [
        paragraph('This test message was sent from the Super Admin panel. If you are reading it, organisations will receive their sign-in codes and password reset links.'),
        details([
          ['SMTP server', esc(host)],
          ['Sent from', esc(fromEmail)],
          ['Sent by', esc(sentBy)],
          ['Sent at', esc(new Date().toUTCString())],
        ]),
      ].join(''),
    }),
    text: `Your ${env.APP_NAME} email settings work.\n\nSMTP server: ${host}\nSent from: ${fromEmail}\nSent by: ${sentBy}${textFooter()}`,
  }),
};
