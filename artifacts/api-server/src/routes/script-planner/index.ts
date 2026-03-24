import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, scriptPlannerChatsTable } from "@workspace/db";
import { eq, and, desc, count, gte } from "drizzle-orm";

const router: IRouter = Router();

router.use(requireAuth);

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

JSON structure (return this exact shape every time):
{
  "script": "Complete word-for-word script with pacing cues",
  "title": "Suggested video title",
  "sections": [
    {
      "start": "0:00",
      "end": "0:15",
      "label": "Hook",
      "text": "Exact script words for this section",
      "camera_angle": "Specific shot/angle description",
      "broll": "Concrete B-roll footage idea",
      "presentation_tip": "One specific delivery tip"
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

JSON structure:
{
  "script": "Complete script text",
  "title": "Suggested video title",
  "sections": [
    {
      "start": "0:00",
      "end": "0:20",
      "label": "Hook",
      "text": "Hook script words",
      "camera_angle": "One camera tip",
      "broll": "",
      "presentation_tip": "One delivery tip"
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

  const plan = req.auth!.plan ?? "free";
  const isFree = plan === "free";
  const isPaid = plan === "premium" || plan === "professional";

  // Enforce free message limit (max 3 user messages per chat)
  if (isFree) {
    const userMessageCount = messages.filter(m => m.role === "user").length;
    if (userMessageCount > 3) {
      res.status(403).json({
        error: "You've used all 3 messages on the free plan. Upgrade to Premium for unlimited messages.",
        limitReached: true,
        type: "message_limit",
      });
      return;
    }
  }

  const systemPrompt = isFree ? SYSTEM_PROMPT_FREE : SYSTEM_PROMPT_FULL;
  const model = isPaid ? "gpt-4o" : "gpt-4o-mini";
  const maxTokens = isFree ? 1200 : 4000;

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
      full_plan: isPaid,
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

  const plan = req.auth!.plan ?? "free";
  const isFree = plan === "free";
  const isPremium = plan === "premium";

  try {
    // Enforce chat count limits by plan
    if (isFree) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(scriptPlannerChatsTable)
        .where(eq(scriptPlannerChatsTable.userId, userId));
      if (total >= 1) {
        res.status(403).json({
          error: "Free plan is limited to 1 saved chat. Upgrade to Premium for 20 chats per month.",
          limitReached: true,
          type: "chat_limit",
        });
        return;
      }
    } else if (isPremium) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [{ total }] = await db
        .select({ total: count() })
        .from(scriptPlannerChatsTable)
        .where(and(
          eq(scriptPlannerChatsTable.userId, userId),
          gte(scriptPlannerChatsTable.createdAt, startOfMonth),
        ));
      if (total >= 20) {
        res.status(403).json({
          error: "You've reached 20 chats this month. Upgrade to Professional for unlimited chats.",
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
