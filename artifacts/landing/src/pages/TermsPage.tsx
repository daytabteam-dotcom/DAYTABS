import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import Navbar from "../components/Navbar";

const sections = [
  {
    title: "1. Acceptance of Terms",
    content: `By accessing or using our platform, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service.`,
  },
  {
    title: "2. Description of Service",
    content: `Our platform provides AI-powered video analysis, including:`,
    bullets: [
      "Video quality insights",
      "Content and SEO analysis",
      "Transcription, translation, and dubbing features",
    ],
    after: "Access to features depends on your subscription plan.",
  },
  {
    title: "3. User Accounts",
    bullets: [
      "You must provide accurate information when signing up.",
      "You are responsible for maintaining the security of your account.",
      "You are responsible for all activity under your account.",
    ],
  },
  {
    title: "4. Subscription & Payments",
    subsections: [
      {
        heading: "Billing",
        bullets: [
          "Paid plans are billed on a monthly subscription basis.",
          "By subscribing, you authorize us to charge your payment method automatically each billing cycle.",
        ],
      },
      {
        heading: "No Refund Policy",
        bullets: [
          "All payments are final and non-refundable.",
          "We do not provide refunds for partial usage, unused time, or accidental purchases.",
        ],
      },
      {
        heading: "Cancellation",
        bullets: [
          "You may cancel your subscription at any time.",
          "Cancellation will take effect at the end of the current billing period.",
          "You will continue to have access to paid features until that period ends.",
        ],
      },
      {
        heading: "Price Changes",
        bullets: [
          "We may update subscription pricing.",
          "Any price changes will be communicated at least 2 weeks in advance.",
          "Continued use after the change means you accept the new pricing.",
        ],
      },
    ],
  },
  {
    title: "5. Usage Restrictions",
    content: "You agree NOT to:",
    bullets: [
      "Use the platform for illegal or harmful activities",
      "Upload content that violates copyright or third-party rights",
      "Attempt to reverse engineer or exploit the system",
    ],
  },
  {
    title: "6. Service Availability",
    bullets: [
      "We do not guarantee uninterrupted or error-free service.",
      "Features may be updated, modified, or discontinued at any time.",
    ],
  },
  {
    title: "7. Limitation of Liability",
    content: "We are not liable for:",
    bullets: [
      "Any indirect, incidental, or consequential damages",
      "Loss of data, revenue, or business opportunities",
    ],
    after: "Use the service at your own risk.",
  },
  {
    title: "8. Termination",
    content:
      "We reserve the right to suspend or terminate accounts that violate these terms.",
  },
  {
    title: "9. Changes to Terms",
    content:
      "We may update these Terms at any time. Continued use of the platform means you accept the updated Terms.",
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <section className="pt-32 pb-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-violet-600/8 rounded-full blur-3xl" />
        </div>

        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/30">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4">
              Terms of <span className="gradient-text">Service</span>
            </h1>
            <p className="text-white/40 text-sm">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-6"
          >
            {sections.map((section, i) => (
              <div
                key={i}
                className="glass rounded-2xl p-6 border border-white/10"
              >
                <h2 className="text-lg font-semibold text-white mb-3">{section.title}</h2>

                {section.content && (
                  <p className="text-white/60 text-sm leading-relaxed mb-3">{section.content}</p>
                )}

                {section.bullets && (
                  <ul className="space-y-2 mb-3">
                    {section.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-white/60">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                {section.after && (
                  <p className="text-white/60 text-sm leading-relaxed">{section.after}</p>
                )}

                {section.subsections && (
                  <div className="space-y-4">
                    {section.subsections.map((sub, k) => (
                      <div key={k}>
                        <h3 className="text-sm font-semibold text-violet-300 mb-2">{sub.heading}</h3>
                        <ul className="space-y-2">
                          {sub.bullets.map((b, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm text-white/60">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400/60 shrink-0" />
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
