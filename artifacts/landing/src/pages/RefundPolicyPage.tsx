import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { RotateCcw } from "lucide-react";
import Navbar from "../components/Navbar";

const sections = [
  {
    title: "1. Overview",
    content: [
      "This Refund Policy explains how DayTabs handles refund requests for paid subscriptions purchased through our website.",
      "DayTabs is a web-based software subscription for creators. Access is granted immediately after purchase, so refund decisions consider both billing details and account usage.",
    ],
  },
  {
    title: "2. Eligible Refund Requests",
    content: ["You may request a refund within 7 days of the charge date when:"],
    bullets: [
      "you were charged unexpectedly and did not intend to renew",
      "the service was materially unavailable or failed to work as described during the paid period",
      "you were billed more than once for the same plan in error",
    ],
  },
  {
    title: "3. Requests That May Be Declined",
    content: ["Refunds are generally not provided for:"],
    bullets: [
      "partial use of a billing period after substantial account activity or analysis usage",
      "unused time remaining after you forget to cancel before renewal",
      "change of mind after receiving the core paid service",
      "violations of our Terms of Service or abusive usage",
    ],
  },
  {
    title: "4. Cancellation Terms",
    content: [
      "You can cancel your subscription at any time. Cancellation stops future renewals and your paid access remains active until the end of the current billing cycle.",
      "Cancelling a plan does not automatically create a refund for the current period.",
    ],
  },
  {
    title: "5. How to Request a Refund",
    content: ["To request a refund, email hello@daytabs.com within 7 days of the charge and include:"],
    bullets: [
      "the email address on your DayTabs account",
      "the date of the charge",
      "a short explanation of the issue",
    ],
  },
  {
    title: "6. Review Process",
    content: [
      "We review requests individually and may ask for extra information to verify the billing issue or service problem.",
      "If approved, refunds are returned to the original payment method. Processing times depend on your payment provider and bank.",
    ],
  },
];

function TextBlock({ paragraphs }: { paragraphs?: string[] }) {
  if (!paragraphs) return null;

  return (
    <div className="space-y-3 mb-3">
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="text-white/60 text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function BulletList({ bullets }: { bullets?: string[] }) {
  if (!bullets) return null;

  return (
    <ul className="space-y-2 mb-3">
      {bullets.map((bullet, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-white/60">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
          {bullet}
        </li>
      ))}
    </ul>
  );
}

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Refund Policy | DayTabs</title>
        <meta
          name="description"
          content="Read the DayTabs refund policy, billing terms, renewal rules, and how to request a refund for a paid subscription."
        />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://daytabs.com/refund-policy" />
      </Helmet>

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
            className="glass rounded-3xl border border-white/10 p-8 md:p-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-violet-300" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-violet-300/70">Billing</p>
                <h1 className="text-3xl md:text-4xl font-bold">Refund Policy</h1>
              </div>
            </div>

            <p className="text-white/60 text-sm leading-relaxed mb-8">
              Last updated: April 23, 2026
            </p>

            <div className="space-y-8">
              {sections.map((section) => (
                <div key={section.title}>
                  <h2 className="text-xl font-semibold mb-3">{section.title}</h2>
                  <TextBlock paragraphs={section.content} />
                  <BulletList bullets={section.bullets} />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
