export const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
export const EMAIL_FROM = process.env.EMAIL_FROM || "";
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || EMAIL_FROM;

export function assertMailConfigured() {
  const missing = [];
  if (!RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!EMAIL_FROM) missing.push("EMAIL_FROM");
  if (!CONTACT_EMAIL) missing.push("CONTACT_EMAIL");

  if (missing.length > 0) {
    return {
      configured: false as const,
      missing,
    };
  }

  return {
    configured: true as const,
    missing: [],
  };
}

type SendEmailInput = {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

type SendEmailResult = {
  id?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from || `DayTabs <${EMAIL_FROM}>`,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: input.replyTo,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Resend request failed with ${response.status}: ${bodyText}`);
  }

  return await response.json() as SendEmailResult;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
