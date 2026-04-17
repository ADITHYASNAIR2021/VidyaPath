interface CredentialMailInput {
  to: string;
  recipientName: string;
  role: 'teacher' | 'admin';
  schoolName?: string;
  loginId: string;
  password: string;
  mustChangePassword?: boolean;
}

interface CredentialMailResult {
  delivered: boolean;
  provider: 'resend' | 'none';
  message: string;
}

function sanitizeText(value: string, max = 180): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRole(role: CredentialMailInput['role']): string {
  return role === 'teacher' ? 'Teacher' : 'Admin';
}

export async function sendCredentialMail(input: CredentialMailInput): Promise<CredentialMailResult> {
  const to = sanitizeText(input.to, 180).toLowerCase();
  const from = sanitizeText(process.env.AUTH_MAIL_FROM || process.env.RESEND_FROM_EMAIL || '', 180);
  const resendKey = sanitizeText(process.env.RESEND_API_KEY || '', 240);
  if (!to || !from || !resendKey) {
    return {
      delivered: false,
      provider: 'none',
      message: 'Credential email provider is not configured.',
    };
  }

  const subject = `${input.schoolName || 'Vidyapath'} ${formatRole(input.role)} Login Credentials`;
  const safeName = escapeHtml(input.recipientName || formatRole(input.role));
  const safeSchool = escapeHtml(input.schoolName || 'Vidyapath');
  const safeLoginId = escapeHtml(input.loginId);
  const safePassword = escapeHtml(input.password);
  const changeLine = input.mustChangePassword
    ? 'You are required to change this password after your first login.'
    : 'Please change this password after login for better security.';
  const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
    <h2 style="margin:0 0 12px 0;">${safeSchool} Credentials</h2>
    <p style="margin:0 0 12px 0;">Hello ${safeName},</p>
    <p style="margin:0 0 12px 0;">Your ${formatRole(input.role)} login has been provisioned.</p>
    <div style="padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
      <p style="margin:0 0 6px 0;"><strong>Login ID:</strong> ${safeLoginId}</p>
      <p style="margin:0;"><strong>Password:</strong> ${safePassword}</p>
    </div>
    <p style="margin:12px 0 0 0;">${escapeHtml(changeLine)}</p>
  </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response) {
    return {
      delivered: false,
      provider: 'resend',
      message: 'Credential email request failed.',
    };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      delivered: false,
      provider: 'resend',
      message: body ? `Credential email failed: ${body.slice(0, 220)}` : 'Credential email failed.',
    };
  }
  return {
    delivered: true,
    provider: 'resend',
    message: 'Credential email sent.',
  };
}
