import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/auth";
import { openai } from "../../lib/openai";
import { db, scriptPlannerChatsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { normalizePlan, PLAN_LIMITS } from "../../lib/planLimits";
import { checkAndIncrementScriptChat } from "../../lib/usageService";

const router: IRouter = Router();

router.use(requireAuth);

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_FULL = `You are a script writer for real YouTube creators. You write the way a confident, experienced human creator actually talks on camera — not like a marketer, not like a copywriter, not like an AI trying to sound enthusiastic.

CRITICAL: Every reply MUST be valid JSON matching the exact structure below. No extra text, no markdown, no code fences.

VOICE RULES (read these carefully, they override everything else):
- Write like a real person talking to one friend, not a crowd
- Use short sentences. Incomplete ones too, when it fits.
- Real creators pause mid-thought. They say "and honestly" or "here's the thing" or "so I tried something"
- NEVER use: "In today's video", "Without further ado", "Let's dive in", "In this video", "game-changer", "secret weapon", "elevate", "unleash", "skyrocket", "transform", "magic", "genius", "perfect", "amazing", "incredible"
- NEVER use em dashes (the character —) anywhere. Use commas or short sentences instead
- NEVER write marketing copy. If a sentence sounds like it belongs in an ad, rewrite it
- NEVER describe the app or product like a salesperson. Let the story sell it
- DO use: "I", "honestly", "so", "here's the thing", "the thing is", "and look", "right", "yeah", "which is wild", "turns out", "I didn't expect that"
- DO ground every section in a specific, real-feeling moment or observation. "I spent two days on a video and got 11 views" is better than "Content creation is hard"
- DO use [PAUSE], [BEAT], [EMPHASISE] as real pacing cues a creator would use, not decoration

HOOK RULES:
- The hook must open with either: a specific number or result ("I posted a video and got 11 views. 6 of them were me."), a bold contrarian claim ("Most editing advice is wrong."), or a scene the viewer has lived ("You know that feeling when you finish a video and have no idea if it's actually good?")
- The hook must create a question in the viewer's mind that the rest of the video answers
- NEVER open with "Ever wondered", "Have you ever", "What if I told you", "Imagine"
- The hook should feel like something a creator actually said, not something a marketer wrote

STRUCTURE RULES:
- Use narrative beats, not product feature names. Label sections: Hook, Problem, My Story, The Shift, How It Works, Proof, CTA, Outro
- NOT: "Feature Highlight", "Story Suggestion", "Content Planner Feature" — these are brochure labels
- Every section must be a moment in a story, not a paragraph in a pitch deck
- A 2-3 minute video needs 8-10 sections minimum, each a distinct beat
- Timestamps must be sequential and continuous
- Each section's "text" field contains ONLY the exact spoken words for that section

SECTION CONTENT RULES:
- camera_angle: be specific and physical. "Medium shot, leaning slightly forward, elbows on desk" not just "Medium shot"
- broll: describe something real and filmable. "Screen recording of the app showing a brightness score updating in real time" not "App footage"
- presentation_tip: one specific delivery note. "Say 'honestly' like you mean it, slow down before the number" not "Be energetic"

JSON structure (return this exact shape every time):
{
  "script": "Complete word-for-word script with pacing cues",
  "title": "Suggested video title — specific, curiosity-gap, under 70 chars, no hype words",
  "sections": [
    {
      "start": "0:00",
      "end": "0:12",
      "label": "Hook",
      "text": "Exact script words for this section only",
      "camera_angle": "Specific shot description with posture and framing",
      "broll": "Specific, filmable footage idea",
      "presentation_tip": "One specific delivery instruction"
    }
  ],
  "teleprompter_ready": true,
  "summary": "One sentence describing what was changed or created"
}

BAD SCRIPT EXAMPLE (never write like this):
"Ever wondered if your videos could do more for you? Imagine having a personal video coach right in your pocket. Meet your new secret weapon."

GOOD SCRIPT EXAMPLE (write like this):
"I spent two days on a video. Filmed it, edited it, posted it. Got 11 views. Six of them were me refreshing the page. [PAUSE] And the worst part? I had no idea what went wrong. Was it the lighting? The hook? The audio? I couldn't tell. [BEAT] So I built something."`;

const SYSTEM_PROMPT_FREE = `You are a script writer for real YouTube creators. You write the way a confident human creator actually talks on camera, not like a marketer.

CRITICAL: Every reply MUST be valid JSON matching the exact structure below. No extra text.

VOICE RULES:
- Write like a real person talking to one friend
- Short sentences. Real pauses. Natural language.
- NEVER use: "In today's video", "game-changer", "secret weapon", "elevate", "unleash", "transform", "magic", "amazing", "incredible", "Ever wondered", "Imagine having", "What if I told you"
- NEVER use em dashes (the character —) anywhere, use commas or short sentences instead
- NEVER write marketing copy
- DO ground the hook in a specific, real-feeling moment with a number or detail
- Break into one section per distinct narrative beat (minimum 3 sections)

BAD HOOK: "Ever wondered if your videos could do more for you? Imagine having a personal video coach right in your pocket."
GOOD HOOK: "I posted a video last week. Spent two days on it. Got 11 views, and I had no idea why."

JSON structure:
{
  "script": "Complete script text",
  "title": "Specific video title, no hype words, under 70 chars",
  "sections": [
    {
      "start": "0:00",
      "end": "0:15",
      "label": "Hook",
      "text": "Hook script words only",
      "camera_angle": "Close-up, leaning slightly forward, direct eye contact",
      "broll": "",
      "presentation_tip": "Say the number slowly, then pause"
    },
    {
      "start": "0:15",
      "end": "0:45",
      "label": "Problem",
      "text": "Problem script words only",
      "camera_angle": "Medium shot, relaxed",
      "broll": "",
      "presentation_tip": "Slow down, speak like you lived this"
    }
  ],
  "teleprompter_ready": true,
  "summary": "One sentence describing what was created or changed"
}`;

// ─── Section label rewriter ───────────────────────────────────────────────────
// Strips AI-ish section labels if they slip through and replaces with narrative ones

const LABEL_MAP: Record<string, string> = {
  "feature highlight": "How It Works",
  "story suggestion": "My Story",
  "content planner": "The Process",
  "content planner feature": "The Process",
  "app overview": "What Changed",
  "product overview": "What Changed",
  "key features": "How It Works",
  "benefits": "Why It Works",
  "testimonial": "Proof",
};

function sanitizeSectionLabel(label: string): string {
  const lower = label.toLowerCase().trim();
  return LABEL_MAP[lower] ?? label;
}

// ─── Hype word filter ─────────────────────────────────────────────────────────
// Post-processes script text to catch any hype words that slipped through

const HYPE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bsecret weapon\b/gi, "tool I built"],
  [/\belevate\b/gi, "improve"],
  [/\bunleash\b/gi, "use"],
  [/\bskyrocket\b/gi, "grow"],
  [/\bgame.changer\b/gi, "useful"],
  [/\bamazing\b/gi, "good"],
  [/\bincredible\b/gi, "real"],
  [/\bmagic\b/gi, "the thing"],
  [/\bgenius\b/gi, "good"],
  [/\bperfect\b/gi, "right"],
  [/\bpowerful\b/gi, "useful"],
  [/\brevolutionary\b/gi, "different"],
  [/\btransform\b/gi, "change"],
  [/\bever wondered\b/gi, "here's something"],
  [/\bimagine having\b/gi, "what if you had"],
  [/\bwhat if i told you\b/gi, "here's the thing"],
  [/\bmeet your new\b/gi, "this is"],
  [/\bright in your pocket\b/gi, "on your phone"],
  [/\belevate your\b/gi, "improve your"],
  [/\bunlock\b/gi, "get"],
  [/\bdiscover\b/gi, "find"],
];

function sanitizeScript(text: string): string {
  let out = text;
  for (const [pattern, replacement] of HYPE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Strip em dashes as a final safety net
  out = out.replace(/\u2014/g, ", ");
  return out;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Generate ─────────────────────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Please provide a conversation history." });
    return;
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  if (!lastUserMsg || lastUserMsg.content.trim().length < 3) {
    res.status(400).json({ error: "Please enter a message." });
    return;
  }

  if (lastUserMsg.content.trim().length > 2000) {
    res.status(400).json({ error: "Message is too long. Keep it under 2000 characters." });
    return;
  }

  const rawPlan = req.auth!.plan ?? "free";
  const plan = normalizePlan(rawPlan);
  const planConfig = PLAN_LIMITS[plan];
  const isFree = plan === "free";
  const isCreator = plan === "creator";
  const isPremiumAI = plan === "pro" || plan === "studio";

  const planMessageLimit = planConfig.script_planner_messages_per_session;
  const userMessageCount = messages.filter(m => m.role === "user").length;

  if (userMessageCount > planMessageLimit) {
    const upgradeHint = isFree
      ? "Upgrade to Creator for 10 messages per chat."
      : "You've reached the 10 message limit for this chat.";
    res.status(403).json({
      code: "MESSAGE_LIMIT_REACHED",
      error: `You've used all ${planMessageLimit} messages on this chat. ${upgradeHint}`,
      title: isFree ? "Message limit reached" : "Chat limit reached",
      message: upgradeHint,
      action: isFree ? { label: "Upgrade to Creator — $19/mo", route: "/pricing?highlight=creator" } : undefined,
      limitReached: true,
      type: "message_limit",
    });
    return;
  }

  const systemPrompt = isFree ? SYSTEM_PROMPT_FREE : SYSTEM_PROMPT_FULL;
  const model = planConfig.script_planner_model;
  const maxTokens = isFree ? 1500 : isCreator ? 4000 : 6000;

  // Keep only the last 10 messages for context, but always include the last user message
  const history = messages.slice(-10);

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
      ],
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: {
      script?: string;
      title?: string;
      sections?: Array<{
        start: string;
        end: string;
        label?: string;
        text: string;
        camera_angle: string;
        broll: string;
        presentation_tip: string;
      }>;
      teleprompter_ready?: boolean;
      summary?: string;
    };

    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(500).json({ error: "Failed to parse AI response. Please try again." });
      return;
    }

    const script = parsed.script ?? "";
    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];

    if (!script) {
      res.status(500).json({ error: "AI did not return a script. Please try again." });
      return;
    }

    // Post-process: sanitize hype words in script and section text
    const cleanScript = sanitizeScript(script);
    const cleanSections = sections.map(s => ({
      ...s,
      label: sanitizeSectionLabel(s.label ?? ""),
      text: sanitizeScript(s.text ?? ""),
      camera_angle: s.camera_angle ?? "",
      broll: s.broll ?? "",
      presentation_tip: s.presentation_tip ?? "",
    }));

    res.json({
      script: cleanScript,
      title: parsed.title ?? "",
      sections: isFree ? cleanSections.slice(0, 1) : cleanSections,
      teleprompter_ready: true,
      summary: parsed.summary ?? "Script updated.",
      raw,
      plan,
      full_plan: !isFree,
    });
  } catch (err) {
    req.log.error({ err }, "Script planner generation failed");
    res.status(500).json({ error: "Failed to generate script. Please try again." });
  }
});

// ── Chat CRUD ─────────────────────────────────────────────────────────────────

// GET /chats — list all chats for the authenticated user
router.get("/chats", async (req, res) => {
  const userId = req.auth!.user_id;

  try {
    const chats = await db
      .select({
        id: scriptPlannerChatsTable.id,
        title: scriptPlannerChatsTable.title,
        createdAt: scriptPlannerChatsTable.createdAt,
        updatedAt: scriptPlannerChatsTable.updatedAt,
      })
      .from(scriptPlannerChatsTable)
      .where(eq(scriptPlannerChatsTable.userId, userId))
      .orderBy(desc(scriptPlannerChatsTable.updatedAt));

    res.json({ chats });
  } catch (err) {
    req.log.error({ err }, "Failed to list chats");
    res.status(500).json({ error: "Failed to load chats." });
  }
});

// GET /chats/:id — get a single chat (full data)
router.get("/chats/:id", async (req, res) => {
  const userId = req.auth!.user_id;
  const chatId = parseInt(req.params.id, 10);

  if (isNaN(chatId)) {
    res.status(400).json({ error: "Invalid chat ID." });
    return;
  }

  try {
    const [chat] = await db
      .select()
      .from(scriptPlannerChatsTable)
      .where(and(eq(scriptPlannerChatsTable.id, chatId), eq(scriptPlannerChatsTable.userId, userId)));

    if (!chat) {
      res.status(404).json({ error: "Chat not found." });
      return;
    }

    res.json({ chat });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch chat");
    res.status(500).json({ error: "Failed to load chat." });
  }
});

// POST /chats — create a new chat
router.post("/chats", async (req, res) => {
  const userId = req.auth!.user_id;
  const { title, displayMessages, apiHistory, result } = req.body as {
    title?: string;
    displayMessages?: unknown[];
    apiHistory?: unknown[];
    result?: unknown;
  };

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "Title is required." });
    return;
  }

  const rawPlanForChat = req.auth!.plan ?? "free";

  try {
    const chatLimitCheck = await checkAndIncrementScriptChat(userId, rawPlanForChat);
    if (!chatLimitCheck.allowed) {
      res.status(429).json({ ...chatLimitCheck.error, limitReached: true, type: "chat_limit" });
      return;
    }

    const [created] = await db
      .insert(scriptPlannerChatsTable)
      .values({
        userId,
        title: title.slice(0, 100),
        displayMessages: displayMessages ?? [],
        apiHistory: apiHistory ?? [],
        result: result ?? null,
      })
      .returning({ id: scriptPlannerChatsTable.id });

    res.json({ chatId: created.id });
  } catch (err) {
    req.log.error({ err }, "Failed to create chat");
    res.status(500).json({ error: "Failed to save chat." });
  }
});

// PUT /chats/:id — update an existing chat
router.put("/chats/:id", async (req, res) => {
  const userId = req.auth!.user_id;
  const chatId = parseInt(req.params.id, 10);

  if (isNaN(chatId)) {
    res.status(400).json({ error: "Invalid chat ID." });
    return;
  }

  const { title, displayMessages, apiHistory, result } = req.body as {
    title?: string;
    displayMessages?: unknown[];
    apiHistory?: unknown[];
    result?: unknown;
  };

  try {
    await db
      .update(scriptPlannerChatsTable)
      .set({
        ...(title !== undefined && { title: String(title).slice(0, 100) }),
        ...(displayMessages !== undefined && { displayMessages }),
        ...(apiHistory !== undefined && { apiHistory }),
        ...(result !== undefined && { result }),
        updatedAt: new Date(),
      })
      .where(and(eq(scriptPlannerChatsTable.id, chatId), eq(scriptPlannerChatsTable.userId, userId)));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update chat");
    res.status(500).json({ error: "Failed to update chat." });
  }
});

// DELETE /chats/:id — delete a chat
router.delete("/chats/:id", async (req, res) => {
  const userId = req.auth!.user_id;
  const chatId = parseInt(req.params.id, 10);

  if (isNaN(chatId)) {
    res.status(400).json({ error: "Invalid chat ID." });
    return;
  }

  try {
    await db
      .delete(scriptPlannerChatsTable)
      .where(and(eq(scriptPlannerChatsTable.id, chatId), eq(scriptPlannerChatsTable.userId, userId)));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete chat");
    res.status(500).json({ error: "Failed to delete chat." });
  }
});

export default router;