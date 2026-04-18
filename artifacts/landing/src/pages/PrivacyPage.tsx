import { motion } from "framer-motion";
import { Shield } from "lucide-react";
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
    title: "1. Information We Collect",
    subsections: [
      {
        heading: "Account Information",
        bullets: [
          "Name and email address",
          "Profile picture",
          "Authentication data, including Google login and LinkedIn login",
        ],
      },
      {
        heading: "Connected Platform Data",
        content: ["When you choose to connect your social media accounts, we collect:"],
        bullets: [
          "TikTok: follower count, video count, total likes, bio, and public profile information",
          "Instagram: follower count, post count, biography, and public profile information",
          "YouTube: subscriber count, video count, channel description, and public channel information",
          "LinkedIn: profile information, post data, and connection count",
        ],
      },
      {
        heading: "Authorization",
        content: [
          "We only collect this data when you explicitly authorize DayTabs to access your accounts. We collect it on your behalf to provide growth analysis and content planning features.",
        ],
      },
      {
        heading: "Usage Data",
        bullets: [
          "Content you create within DayTabs, including growth plans, calendars, and notes",
          "Uploaded files and context documents used for AI planning",
          "Feature interactions and preferences",
          "Generated AI content, including calendars, trend analyses, and recommendations",
        ],
      },
      {
        heading: "Trend and Public Data",
        bullets: [
          "Publicly available trending topics from Google Trends",
          "Public post titles from Reddit, with no account data",
          "Public trending video titles from YouTube",
        ],
      },
    ],
  },
  {
    title: "2. How We Use Your Data",
    content: ["We use your data to:"],
    bullets: [
      "Provide the Growth Planner and content calendar features",
      "Analyze your connected social media accounts to generate personalized recommendations",
      "Fetch real-time trend data to inform your content strategy",
      "Generate AI-powered content plans using OpenAI's API",
      "Improve our services and features",
      "Communicate updates and important information",
    ],
  },
  {
    title: "3. Connected Social Media Accounts",
    subsections: [
      {
        heading: "TikTok",
        content: [
          "We integrate with the TikTok API to read your account statistics and profile data when you connect your TikTok account. We do not post to TikTok on your behalf unless you explicitly use a posting feature.",
          "TikTok's Privacy Policy applies to data obtained through their platform: https://www.tiktok.com/legal/privacy-policy",
        ],
      },
      {
        heading: "Instagram and Facebook",
        content: [
          "We integrate with the Instagram Graph API, provided by Meta, to read your account statistics and post performance when you connect your Instagram account. This requires a Professional, Business, or Creator Instagram account.",
          "Meta's Privacy Policy applies: https://www.facebook.com/privacy/policy",
        ],
      },
      {
        heading: "YouTube",
        content: [
          "We integrate with the YouTube Data API v3, provided by Google, to read your channel statistics and video performance when you connect your YouTube account.",
          "Google's Privacy Policy applies: https://policies.google.com/privacy",
          "Our use of YouTube API Services is also subject to the YouTube Terms of Service: https://www.youtube.com/t/terms",
        ],
      },
      {
        heading: "LinkedIn",
        content: [
          "We integrate with the LinkedIn API to read your profile data and post activity when you connect your LinkedIn account.",
          "LinkedIn's Privacy Policy applies: https://www.linkedin.com/legal/privacy-policy",
        ],
      },
      {
        heading: "Disconnection",
        content: [
          "You can disconnect any connected platform at any time from your DayTabs account settings. Disconnecting will stop future data collection from that platform.",
        ],
      },
    ],
  },
  {
    title: "4. AI Processing",
    content: [
      "We use OpenAI's API to generate content plans, trend analyses, and recommendations. Data you provide, including your profile, niche, goals, and connected platform statistics, is sent to OpenAI for processing.",
      "OpenAI's Privacy Policy applies: https://openai.com/policies/privacy-policy",
      "We do not use your data to train AI models.",
    ],
  },
  {
    title: "5. Data Storage & Security",
    bullets: [
      "Your data is stored on secure servers hosted by Render: https://render.com/privacy",
      "Connected platform tokens used to access your social accounts are stored encrypted",
      "We take reasonable technical measures to protect your data",
      "No system is 100% secure and you use the service at your own risk",
      "Platform access tokens are stored only as long as your account remains connected",
    ],
  },
  {
    title: "6. Data Sharing",
    content: ["We do NOT sell your personal data.", "We share data only with:"],
    bullets: [
      "OpenAI, for AI content generation using your profile and platform stats",
      "Google, for YouTube API access and authentication",
      "Meta, for Instagram API access",
      "TikTok, for TikTok API access",
      "LinkedIn, for LinkedIn API access",
      "Render, for hosting and infrastructure",
      "Legal authorities if required by law",
    ],
    after: [
      "Each of these services has its own privacy policy governing how they handle data passed through their APIs.",
    ],
  },
  {
    title: "7. User Content",
    bullets: [
      "You retain ownership of all content you create in DayTabs",
      "By using the service, you grant us permission to process your content solely for the purpose of providing features to you",
      "AI-generated content, including calendars, plans, and recommendations, belongs to you",
      "We do not claim ownership over your social media content or statistics",
    ],
  },
  {
    title: "8. Data Retention",
    bullets: [
      "We retain your account data as long as your account is active",
      "Connected platform tokens are deleted when you disconnect a platform or delete your account",
      "Generated content plans are retained until you delete them or your account",
      "You may request complete deletion of your data at any time by contacting us at hello@daytabs.com",
      "Upon deletion request, we will remove your data within 30 days",
    ],
  },
  {
    title: "9. Cookies & Tracking",
    bullets: [
      "We use cookies for authentication and session management",
      "We do not use third-party advertising cookies",
      "You can disable cookies in your browser settings, though this may affect authentication features",
    ],
  },
  {
    title: "10. Third-Party Services",
    content: ["Beyond the social media platforms listed above, we may use:"],
    bullets: [
      "Google Analytics, for understanding how features are used",
      "Email service providers, for transactional emails",
    ],
  },
  {
    title: "11. Your Rights",
    content: ["You have the right to:"],
    bullets: [
      "Access all data we hold about you",
      "Request corrections to inaccurate data",
      "Request complete deletion of your account and data",
      "Disconnect any connected social media platform at any time",
      "Export your generated content plans",
      "Opt out of non-essential communications",
      "To exercise any of these rights, contact us at hello@daytabs.com",
    ],
  },
  {
    title: "12. Children's Privacy",
    content: [
      "DayTabs is not intended for users under the age of 13. We do not knowingly collect data from children under 13.",
    ],
  },
  {
    title: "13. Changes to Privacy Policy",
    content: [
      "We may update this policy as we add new features or integrations. We will notify you of significant changes via email or an in-app notice. Continued use of the platform after changes constitutes acceptance.",
    ],
  },
  {
    title: "14. Contact",
    content: ["For privacy-related questions or data requests: hello@daytabs.com"],
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

                {section.subsections && (
                  <div className="space-y-4 mb-3">
                    {section.subsections.map((sub, k) => (
                      <div key={k}>
                        <h3 className="text-sm font-semibold text-violet-300 mb-2">{sub.heading}</h3>
                        <TextBlock paragraphs={sub.content} />
                        <BulletList bullets={sub.bullets} />
                      </div>
                    ))}
                  </div>
                )}

                {section.after && (
                  <TextBlock paragraphs={section.after} />
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </section>
    </div>
  );
}
