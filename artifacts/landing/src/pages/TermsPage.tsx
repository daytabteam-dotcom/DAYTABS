import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import Navbar from "../components/Navbar";

type Subsection = {
  heading: string;
  content?: string[];
  bullets?: string[];
};

type Section = {
  title: string;
  content?: string[];
  bullets?: string[];
  after?: string[];
  subsections?: Subsection[];
};

const sections: Section[] = [
  {
    title: "1. Acceptance of Terms",
    content: [
      'By accessing or using DayTabs ("the Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, you may not use the Service.',
    ],
  },
  {
    title: "2. Description of Service",
    content: ["DayTabs provides AI-powered tools for content creators, including:"],
    bullets: [
      "AI-powered video analysis and quality insights",
      "Content and SEO analysis",
      "Transcription, translation, and dubbing features",
      "Growth Planner: AI-generated content calendars and strategy recommendations",
      "Social media account analytics and trend analysis",
      "Connected platform data insights, including TikTok, Instagram, YouTube, and LinkedIn",
    ],
    after: [
      "Access to specific features depends on your subscription plan. Features may vary by plan and are subject to change.",
    ],
  },
  {
    title: "3. User Accounts",
    bullets: [
      "You must provide accurate and complete information when signing up",
      "You are responsible for maintaining the security of your account and password",
      "You are responsible for all activity that occurs under your account",
      "You must be at least 13 years old to use the Service",
      "One person or legal entity may not maintain more than one free account",
    ],
  },
  {
    title: "4. Connected Social Media Accounts",
    content: ["By connecting your social media accounts to DayTabs, you agree to the following:"],
    subsections: [
      {
        heading: "Authorization",
        content: [
          "You authorize DayTabs to access your connected accounts solely for the purpose of reading account statistics, profile data, and post performance to provide growth analysis features. We request only the minimum permissions necessary.",
        ],
      },
      {
        heading: "Your Responsibilities",
        bullets: [
          "You must own or have authorization to connect any account you link to DayTabs",
          "You must comply with the terms of service of each connected platform: TikTok Terms of Service: https://www.tiktok.com/legal/terms-of-service",
          "Instagram/Meta Terms: https://www.facebook.com/terms.php",
          "YouTube Terms of Service: https://www.youtube.com/t/terms",
          "LinkedIn User Agreement: https://www.linkedin.com/legal/user-agreement",
          "You are solely responsible for how you use insights and recommendations generated from your connected account data",
        ],
      },
      {
        heading: "Disconnection",
        content: [
          "You may disconnect any platform at any time from your account settings. Upon disconnection, we will stop collecting new data from that platform. Previously collected statistics may be retained as described in our Privacy Policy.",
        ],
      },
      {
        heading: "Platform API Compliance",
        content: [
          "Our use of third-party platform APIs is subject to their respective developer policies. If a platform revokes our API access or changes their terms, we may need to modify or discontinue related features without notice.",
        ],
      },
    ],
  },
  {
    title: "5. AI-Generated Content",
    subsections: [
      {
        heading: "Nature of AI Output",
        content: [
          "The Growth Planner and other AI features generate content recommendations, calendars, and strategies using OpenAI's API. You acknowledge that:",
        ],
        bullets: [
          "AI-generated content is provided as a starting point, not a guarantee of results",
          "Engagement estimates, reach projections, and performance predictions are approximations based on available data and industry benchmarks, not guaranteed outcomes",
          "Trend data is sourced from public APIs and may not be complete or fully accurate",
          "You are solely responsible for reviewing, editing, and approving any AI-generated content before publishing it",
        ],
      },
      {
        heading: "Ownership",
        content: [
          "You own the content plans, calendars, and recommendations generated for your account. You grant DayTabs a limited license to process and store this content solely to provide the Service to you.",
        ],
      },
      {
        heading: "No Endorsement",
        content: [
          "AI-generated competitor suggestions, trend recommendations, and content ideas do not constitute endorsement of any third-party account, product, or strategy. All recommendations should be independently verified before acting on them.",
        ],
      },
    ],
  },
  {
    title: "6. Subscription & Payments",
    subsections: [
      {
        heading: "Billing",
        bullets: [
          "Paid plans are billed on a monthly subscription basis",
          "By subscribing, you authorize us to charge your payment method automatically each billing cycle",
          "All fees are in USD unless otherwise stated",
        ],
      },
      {
        heading: "Plans",
        bullets: [
          "Free: limited access to core features",
          "Studio: full access including Growth Planner AI generation and connected platform analytics",
        ],
      },
      {
        heading: "No Refund Policy",
        bullets: [
          "All payments are final and non-refundable",
          "We do not provide refunds for partial usage, unused time, or accidental purchases",
          "If you believe you were charged in error, contact us within 7 days at hello@daytabs.com",
        ],
      },
      {
        heading: "Cancellation",
        bullets: [
          "You may cancel your subscription at any time from account settings",
          "Cancellation takes effect at the end of the current billing period",
          "You retain access to paid features until that period ends",
          "Downgrading to free will restrict access to Studio-only features",
        ],
      },
      {
        heading: "Price Changes",
        bullets: [
          "We may update subscription pricing with at least 14 days advance notice",
          "Notice will be provided via email or in-app notification",
          "Continued use after a price change constitutes acceptance of new pricing",
        ],
      },
    ],
  },
  {
    title: "7. Usage Restrictions",
    content: ["You agree NOT to:"],
    bullets: [
      "Use the Service for any illegal or harmful purpose",
      "Upload content that violates copyright, trademark, or third-party rights",
      "Attempt to reverse engineer, scrape, or exploit any part of the Service",
      "Use the Service to spam, harass, or mislead others",
      "Share, resell, or sublicense access to your account",
      "Use AI-generated content to impersonate another person or brand",
      "Circumvent any rate limits, access controls, or security measures",
      "Use the Service to violate the terms of any connected social media platform",
      "Attempt to extract raw data from connected platforms beyond what DayTabs surfaces in its interface",
    ],
  },
  {
    title: "8. Trend and Third-Party Data",
    content: [
      "DayTabs surfaces trend data from publicly available sources including Google Trends, Reddit, and YouTube. This data is:",
    ],
    bullets: [
      "Provided for informational purposes only",
      "Not guaranteed to be complete, accurate, or timely",
      "Subject to availability and changes in third-party APIs",
    ],
    after: [
      "We are not responsible for decisions made based on trend data or AI-generated recommendations.",
    ],
  },
  {
    title: "9. Service Availability",
    bullets: [
      "We do not guarantee uninterrupted or error-free service",
      "AI generation features depend on third-party APIs, including OpenAI, Google, Meta, TikTok, and LinkedIn, which may experience downtime independently",
      "Connected platform features may be temporarily unavailable if a platform API is down or changes their access policies",
      "Features may be updated, modified, or discontinued at any time",
      "We will make reasonable efforts to notify users of significant feature changes in advance",
    ],
  },
  {
    title: "10. Intellectual Property",
    bullets: [
      "DayTabs, its logo, and all original platform content are owned by DayTabs and protected by applicable intellectual property laws",
      "You may not use our branding, copy our interface, or represent yourself as affiliated with DayTabs without written permission",
      "You retain all rights to your own social media content and accounts",
    ],
  },
  {
    title: "11. Limitation of Liability",
    content: ["To the maximum extent permitted by law, DayTabs is not liable for:"],
    bullets: [
      "Any indirect, incidental, special, or consequential damages",
      "Loss of data, revenue, followers, engagement, or business opportunities",
      "Results or outcomes from acting on AI-generated recommendations",
      "Service interruptions caused by third-party platform API changes or outages",
      "Unauthorized access to your connected social media accounts resulting from your failure to secure your DayTabs account credentials",
    ],
    after: [
      "Use the Service at your own risk. Our total liability to you for any claim shall not exceed the amount you paid to DayTabs in the 3 months preceding the claim.",
    ],
  },
  {
    title: "12. Indemnification",
    content: ["You agree to indemnify and hold DayTabs harmless from any claims, damages, or expenses arising from:"],
    bullets: [
      "Your use of the Service in violation of these Terms",
      "Content you publish using AI-generated recommendations",
      "Your violation of any third-party platform's terms of service",
      "Your connected social media account activity",
    ],
  },
  {
    title: "13. Termination",
    content: ["We reserve the right to suspend or terminate accounts that:"],
    bullets: [
      "Violate these Terms of Service",
      "Violate the terms of any connected platform",
      "Engage in fraudulent or abusive behavior",
      "Remain inactive for an extended period on free plans",
    ],
    after: [
      "Upon termination, your access to paid features ends immediately. You may request an export of your generated content plans within 30 days of termination.",
    ],
  },
  {
    title: "14. Governing Law",
    content: [
      "These Terms are governed by the laws of the State of California, USA. Any disputes shall be resolved in the courts of California.",
    ],
  },
  {
    title: "15. Changes to Terms",
    content: [
      "We may update these Terms at any time. For significant changes we will notify you via email or in-app notice at least 14 days before they take effect. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.",
    ],
  },
  {
    title: "16. Contact",
    content: ["For questions about these Terms: hello@daytabs.com"],
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
            <p className="text-white/40 text-sm">Last updated: April 18, 2026</p>
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

                <TextBlock paragraphs={section.content} />

                <BulletList bullets={section.bullets} />

                {section.after && (
                  <TextBlock paragraphs={section.after} />
                )}

                {section.subsections && (
                  <div className="space-y-4">
                    {section.subsections.map((sub, k) => (
                      <div key={k}>
                        <h3 className="text-sm font-semibold text-violet-300 mb-2">{sub.heading}</h3>
                        <TextBlock paragraphs={sub.content} />
                        <BulletList bullets={sub.bullets} />
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
