import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import Navbar from "../components/Navbar";

const sections = [
  {
    title: "1. Information We Collect",
    subsections: [
      {
        heading: "Account Information",
        bullets: [
          "Name",
          "Email address",
          "Authentication data (e.g., Google login)",
        ],
      },
      {
        heading: "Usage Data",
        bullets: [
          "Uploaded videos",
          "Generated transcripts and analysis",
          "Interaction with features",
        ],
      },
    ],
  },
  {
    title: "2. How We Use Your Data",
    content: "We use your data to:",
    bullets: [
      "Provide and improve our services",
      "Process video analysis and AI features",
      "Communicate updates and important information",
    ],
  },
  {
    title: "3. Data Storage & Security",
    bullets: [
      "We take reasonable measures to protect your data.",
      "However, no system is 100% secure.",
      "You use the service at your own risk.",
    ],
  },
  {
    title: "4. Data Sharing",
    content: "We do NOT sell your personal data.",
    after: "We may share data with:",
    bullets: [
      "Trusted service providers (e.g., hosting, AI processing)",
      "Legal authorities if required by law",
    ],
  },
  {
    title: "5. User Content",
    bullets: [
      "You retain ownership of your uploaded content.",
      "By using the service, you grant us permission to process your content for providing features.",
    ],
  },
  {
    title: "6. Data Retention",
    bullets: [
      "We retain data as long as necessary to provide the service.",
      "You may request deletion of your data.",
    ],
  },
  {
    title: "7. Cookies & Tracking",
    bullets: [
      "We may use cookies to improve user experience and authentication.",
      "You can disable cookies in your browser settings.",
    ],
  },
  {
    title: "8. Third-Party Services",
    bullets: [
      "We may use third-party services (e.g., Google Authentication).",
      "Their privacy policies also apply.",
    ],
  },
  {
    title: "9. Your Rights",
    content: "You may:",
    bullets: [
      "Access your data",
      "Request corrections",
      "Request deletion",
    ],
  },
  {
    title: "10. Changes to Privacy Policy",
    content:
      "We may update this policy. Continued use of the platform means acceptance of changes.",
  },
];

export default function PrivacyPage() {
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
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4">
              Privacy <span className="gradient-text">Policy</span>
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

                {section.subsections && (
                  <div className="space-y-4 mb-3">
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

                {section.after && (
                  <p className="text-white/60 text-sm leading-relaxed mb-3">{section.after}</p>
                )}

                {section.bullets && (
                  <ul className="space-y-2">
                    {section.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-white/60">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
