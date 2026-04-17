import { Router } from "express";
import { CONTACT_EMAIL, SMTP_USER, assertMailConfigured, createMailTransport, escapeHtml } from "../../lib/email";

const router = Router();

router.post("/notify", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    const mailConfig = assertMailConfigured();
    if (!mailConfig.configured) {
      req.log.error({ missing: mailConfig.missing, email }, "Dubbing notification email is not configured");
      res.status(503).json({ error: "Email is not configured. Please contact support directly." });
      return;
    }

    const transport = createMailTransport();
    const info = await transport.sendMail({
      from: `"DayTabs" <${SMTP_USER}>`,
      to: CONTACT_EMAIL,
      subject: "AI Dubbing Request",
      text: `A user has requested to be notified when AI Dubbing launches.\n\nEmail: ${email}\n\nThis was submitted from the DayTabs AI Dubbing waitlist.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0d0814; border-radius: 12px; border: 1px solid #2a1f3d; color: #fff;">
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #a78bfa;">AI Dubbing Request</h2>
          <p style="margin: 0 0 24px; color: #9ca3af; font-size: 14px;">A user signed up for the AI Dubbing waitlist on DayTabs.</p>
          <div style="padding: 16px; background: #1a0f2e; border-radius: 8px; border: 1px solid #2a1f3d;">
            <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase;">Submitted Email</p>
            <p style="margin: 8px 0 0; font-size: 16px; font-weight: 600; color: #c4b5fd;">${escapeHtml(email)}</p>
          </div>
        </div>
      `,
    });
    req.log.info({ email, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, "Dubbing notification email sent");

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Dubbing notification email error");
    res.status(500).json({ error: "Failed to submit. Please try again." });
  }
});

export default router;
