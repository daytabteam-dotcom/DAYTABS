import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || SMTP_USER;

function createMailTransport() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

router.post("/notify", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  const transport = createMailTransport();
  if (transport && CONTACT_EMAIL) {
    try {
      await transport.sendMail({
        from: `"DayTabs" <${SMTP_USER}>`,
        to: CONTACT_EMAIL,
        subject: "AI Dubbing Request",
        text: `A user has requested to be notified when AI Dubbing launches.\n\nEmail: ${email}\n\nThis was submitted from the DayTabs AI Dubbing waitlist.`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0d0814; border-radius: 12px; border: 1px solid #2a1f3d; color: #fff;">
            <h2 style="margin: 0 0 8px; font-size: 20px; color: #a78bfa;">AI Dubbing Request</h2>
            <p style="margin: 0 0 24px; color: #9ca3af; font-size: 14px;">A user signed up for the AI Dubbing waitlist on DayTabs.</p>
            <div style="padding: 16px; background: #1a0f2e; border-radius: 8px; border: 1px solid #2a1f3d;">
              <p style="margin: 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Submitted Email</p>
              <p style="margin: 8px 0 0; font-size: 16px; font-weight: 600; color: #c4b5fd;">${email}</p>
            </div>
          </div>
        `,
      });
    } catch {
      // Log silently — don't fail the request if email fails
    }
  }

  res.json({ success: true });
});

export default router;
