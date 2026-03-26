import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/auth";
import { openai } from "../../lib/openai";
import { db, scriptPlannerChatsTable } from "@workspace/db";
import { eq, and, desc, count, gte } from "drizzle-orm";

const router: IRouter = Router();

router.use(requireAuth);

function normalizePlan(plan: string): "free" | "creator" | "pro" | "studio" {
  if (plan === "premium") return "creator";
  if (plan === "professional") return "studio";
  if (plan === "creator" || plan === "pro" || plan === "studio") return plan as "creator" | "pro" | "studio";
  return "free";
}

const SYSTEM_PROMPT_FULL = `You are an expert content strategist and scriptwriter who specialises in high-performing YouTube and social media videos.

CRITICAL: Every reply MUST be valid JSON matching the exact structure below. No extra text, no markdown, no code fences.

Rules for every script you write or edit:
- Write like a real human creator, conversational, punchy, and natural
- NEVER use: "In today's video...", "Without further ado...", "Let's dive in", "In this video"
- NEVER use em dashes (the character —) anywhere in your output, use commas or semicolons instead
- Hook must grab attention in the first 5 seconds, pattern interrupt, bold statement, or curiosity gap
- Use proven structures: Hook, Problem, Story, Solution, CTA, or AIDA, or PAS
- Add influencer retention tricks: open loops, callbacks, "stay to the end" moments
- Include natural pacing: [PAUSE], [EMPHASISE], [BEAT] cues inside the script
- When the user asks for edits (shorter hook, different tone, more energy), update the full script accordingly
- Always regenerate ALL sections matching the updated script

SECTION RULES (most important):
- Every distinct paragraph, beat, or scene in the script MUST be its own section
- A 3-5 minute video should have 8-12 sections minimum
- A 1-2 minute video should have 5-7 sections minimum
- NEVER combine multiple scenes into one section
- Label each section clearly: Hook, Problem, Story, Pivot, Insight, Example, Solution, CTA, Outro, etc.
- Timestamps must be sequential and continuous — the end of one section is the start of the next
- Each section's "text" field contains ONLY the exact words spoken in that section

JSON structure (return this exact shape every time, with AS MANY sections as the script has scenes/paragraphs):
{
  "script": "Complete word-for-word script with pacing cues",
  "title": "Suggested video title",
  "sections": [
    {
      "start": "0:00",
      "end": "0:12",
      "label": "Hook",
      "text": "Exact script words for this section only",
      "camera_angle": "Specific shot/angle description",
      "broll": "Concrete B-roll footage idea",
      "presentation_tip": "One specific delivery tip"
    },
    {
      "start": "0:12",
      "end": "0:35",
      "label": "Problem",
      "text": "Exact script words for this section only",
      "camera_angle": "Medium shot, direct eye contact",
      "broll": "Footage of the problem being described",
      "presentation_tip": "Slow down, let the problem sink in"
    },
    {
      "start": "0:35",
      "end": "1:10",
      "label": "Story",
      "text": "Exact script words for this section only",
      "camera_angle": "Wider shot, relaxed posture",
      "broll": "Relevant archive footage or photo slides",
      "presentation_tip": "Vary your pace, pause on key moments"
    }
  ],
  "teleprompter_ready": true,
  "summary": "One sentence describing what was changed or created"
}`;

const SYSTEM_PROMPT_FREE = `You are an expert scriptwriter for social media videos.

CRITICAL: Every reply MUST be valid JSON matching the exact structure below. No extra text.

Rules:
- Write conversationally, no robotic AI phrases
- NEVER use em dashes (the character —) anywhere, use commas or semicolons instead
- Include one strong hook at the start (pattern interrupt or curiosity gap)
- Keep it concise and punchy
- When the user asks for edits, update the full script accordingly
- Break the script into one section per distinct scene or paragraph (minimum 3 sections)

JSON structure:
{
  "script": "Complete script text",
  "title": "Suggested video title",
  "sections": [
    {
      "start": "0:00",
      "end": "0:15",
      "label": "Hook",
      "text": "Hook script words only",
      "camera_angle": "Close-up, eye contact",
      "broll": "",
      "presentation_tip": "Be bold, speak fast"
    },
    {
      "start": "0:15",
      "end": "0:45",
      "label": "Main Point",
      "text": "Main point script words only",
      "camera_angle": "Medium shot",
      "broll": "",
      "presentation_tip": "Slow down for emphasis"
    }
  ],
  "teleprompter_ready": true,
  "summary": "One sentence describing what was created or changed"
}`;

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
  const isFree = plan === "free";
  const isCreator = plan === "creator";
  const isPremiumAI = plan === "pro" || plan === "studio";

  const planMessageLimit = isFree ? 3 : 10;
  const userMessageCount = messages.filter(m => m.role === "user").length;

  if (userMessageCount > planMessageLimit) {
    const upgradeHint = isFree
      ? "Upgrade to Creator for 10 messages per chat."
      : "You've reached the 10 message limit for this chat.";
    res.status(403).json({
      error: `You've used all ${planMessageLimit} messages on this chat. ${upgradeHint}`,
      limitReached: true,
      type: "message_limit",
    });
    return;
  }

  const systemPrompt = isFree ? SYSTEM_PROMPT_FREE : SYSTEM_PROMPT_FULL;
  const model = isPremiumAI ? "gpt-4o" : "gpt-4o-mini";
  const maxTokens = isFree ? 1500 : isCreator ? 4000 : 6000;

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

    res.json({
      script,
      title: parsed.title ?? "",
      sections: isFree ? sections.slice(0, 1) : sections,
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
  const plan = normalizePlan(rawPlanForChat);
  const isFree = plan === "free";

  const CHAT_LIMITS: Record<string, number> = { free: 1, creator: 15, pro: 40, studio: Infinity };
  const chatLimit = CHAT_LIMITS[plan] ?? 1;

  try {
    if (chatLimit !== Infinity) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const whereClause = isFree
        ? eq(scriptPlannerChatsTable.userId, userId)
        : and(eq(scriptPlannerChatsTable.userId, userId), gte(scriptPlannerChatsTable.createdAt, startOfMonth));

      const [{ total }] = await db
        .select({ total: count() })
        .from(scriptPlannerChatsTable)
        .where(whereClause!);

      if (total >= chatLimit) {
        const nextPlan = plan === "free" ? "Creator" : plan === "creator" ? "Pro" : "Studio";
        res.status(403).json({
          error: isFree
            ? `Free plan is limited to 1 saved chat. Upgrade to Creator for 15 chats per month.`
            : `You've reached ${chatLimit} chats this month. Upgrade to ${nextPlan} for more.`,
          limitReached: true,
          type: "chat_limit",
        });
        return;
      }
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
