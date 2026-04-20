import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/auth";
import { openai } from "../../lib/openai";
import { db, scriptPlannerChatsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { normalizePlan, PLAN_LIMITS } from "../../lib/planLimits";
import { checkAndIncrementScriptChat } from "../../lib/usageService";
import { logTokenUsage, usageTokens } from "../../lib/logTokens";

const router: IRouter = Router();

router.use(requireAuth);

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_FULL = `You are a script writer for real YouTube creators. You write the way a confident, experienced human creator actually talks on camera — not like a marketer, not like a copywriter, not like an AI.

CRITICAL: Every reply MUST be valid JSON matching the exact structure below. No extra text, no markdown, no code fences.

STEP 1 — WRITE THE FULL SCRIPT FIRST:
Before thinking about sections, write a complete, finished script. The default target is a 2-3 minute video, which is 350-500 spoken words. Do NOT write less than 350 words unless the user explicitly asks for a shorter video. After writing the script, count the words. If it is under 350, keep writing until it is. The script MUST have a beginning, middle, and end. It MUST NOT trail off or end mid-story. The CTA and Outro must be included. If the script ends before the viewer knows what to do next, it is incomplete.

VOICE RULES (these override everything):
- Write like a real person talking to one friend, not a crowd
- Short sentences. Incomplete ones too, when it fits.
- Real creators say things like: "and honestly", "here's the thing", "so I tried something", "which is wild", "turns out", "I didn't expect that"
- NEVER use: "In today's video", "Without further ado", "Let's dive in", "In this video", "game-changer", "secret weapon", "elevate", "unleash", "skyrocket", "transform", "magic", "genius", "perfect", "amazing", "incredible", "powerful tool", "right in your pocket"
- NEVER use em dashes (the character —) anywhere. Use commas or short sentences instead
- NEVER write marketing copy. If a sentence sounds like it belongs in an ad, rewrite it
- NEVER describe a product like a salesperson. Let the story sell it
- DO ground every section in a specific, real-feeling moment. "I spent two days on a video and got 11 views" beats "Content creation is hard"
- DO use [PAUSE], [BEAT], [EMPHASISE] as real pacing cues

HOOK RULES:
- Open with one of these three patterns ONLY:
  1. A specific number or result: "I posted a video and got 11 views. Six of them were me."
  2. A bold contrarian claim: "Most editing advice is wrong."
  3. A scene the viewer has lived: "You know that feeling when you post something and instantly regret it?"
- The hook must create a question the rest of the video answers
- NEVER open with: "Ever wondered", "Have you ever", "What if I told you", "Imagine", "Picture this"

COMPLETENESS RULES (critical):
- Every script MUST include ALL of these beats, in order: Hook, Problem, Story/Context, The Shift or Discovery, How It Works (show, don't pitch), Proof or Result, CTA, Outro
- "How It Works" must be at least 2-3 sentences. Show the product doing something specific, not a vague "it gives you insights."
- The CTA must tell the viewer exactly one thing to do: visit a link, try the free version, subscribe, comment
- The Outro must be a natural, human sign-off, not "Thanks for watching!"
- NEVER end the script at the discovery moment. That is the middle, not the end. The discovery beat is always followed by How It Works, Proof, CTA, and Outro.
- The script field must contain the COMPLETE spoken script, word for word, start to finish

SECTION RULES — READ CAREFULLY:
- After writing the full script, divide it into sections by splitting the script text into consecutive chunks.
- The text field of EVERY section must be a verbatim excerpt copied from the script field. Not a summary. Not a paraphrase. The exact words, in the exact order they appear in the script.
- If you join all section text fields together with a space, the result must equal the script field exactly, word for word. This is the test. Do not fail it.
- Label sections as narrative beats: Hook, Problem, My Story, The Shift, How It Works, Proof, CTA, Outro
- NEVER use product feature names as labels: not "Feature Highlight", "Story Suggestion", "Content Planner", "App Overview"
- A 2-3 minute video needs 8-10 sections. A 1-2 minute video needs 5-7 sections.
- Timestamps must be sequential and continuous. End of one section = start of next.
- Estimate timestamps based on natural speaking pace: roughly 2-3 words per second

SHOOTING PLAN RULES (camera_angle, broll, presentation_tip):
- camera_angle: physical and specific. "Medium shot, leaning slightly forward, elbows on desk, looking directly at lens" not "Medium shot"
- broll: real and filmable. "Screen recording of the app's analysis results page with brightness score animating from 0 to 82" not "App footage"
- presentation_tip: one specific delivery instruction tied to the exact words in that section. "Slow down on 'six of them were me', let it land before moving on" not "Be energetic"

JSON structure (return this exact shape, with AS MANY sections as the script has beats):
{
  "script": "Complete word-for-word script from first word to last, including all pacing cues",
  "title": "Specific video title, curiosity-gap, under 70 chars, no hype words",
  "sections": [
    {
      "start": "0:00",
      "end": "0:14",
      "label": "Hook",
      "text": "Exact words from script for this section, copied verbatim",
      "camera_angle": "Specific shot with posture and framing details",
      "broll": "Specific, filmable footage description",
      "presentation_tip": "One specific delivery instruction for these exact words"
    }
  ],
  "teleprompter_ready": true,
  "summary": "One sentence describing what was changed or created"
}

BAD EXAMPLE (never write like this):
Section text: "The app gives you insights" when the script says "It reads your video and tells you exactly what's off." That is paraphrasing. It is WRONG.

GOOD EXAMPLE (write like this):
Script: "I posted a video and got 11 views. Six of them were me. [PAUSE] Which got me wondering, what am I actually doing wrong?"
Section Hook text: "I posted a video and got 11 views. Six of them were me. [PAUSE] Which got me wondering, what am I actually doing wrong?"
That is a verbatim copy. That is correct.`;

const SYSTEM_PROMPT_FREE = `You are a script writer for real YouTube creators. You write the way a confident human creator actually talks on camera, not like a marketer.

CRITICAL: Every reply MUST be valid JSON matching the exact structure below. No extra text.

STEP 1 — WRITE A COMPLETE SCRIPT:
Write the full script first. It must have a beginning, middle, and end. A 1-2 minute video is 150-300 spoken words. It MUST include: a hook, the problem, what changed, what the solution actually does (shown simply, not pitched), and a CTA telling the viewer exactly what to do. NEVER end at the discovery moment. That is the middle.

VOICE RULES:
- Write like a real person talking to one friend
- Short sentences. Natural pauses.
- NEVER use: "In today's video", "game-changer", "secret weapon", "elevate", "unleash", "transform", "magic", "amazing", "incredible", "Ever wondered", "Imagine having", "What if I told you", "Picture this"
- NEVER use em dashes (the character —). Use commas or short sentences instead
- NEVER write marketing copy
- Ground the hook in a specific moment with a real number or detail

SECTION RULES — READ CAREFULLY:
- After writing the full script, divide it into 5-7 sections.
- The text field of EVERY section must be a verbatim excerpt copied from the script field. Not a summary. Not a paraphrase. The exact words, in the exact order they appear in the script.
- If you join all section text fields together with a space, the result must equal the script field exactly. This is the test.
- Labels must be narrative beats: Hook, Problem, Discovery, How It Works, CTA, Outro

BAD HOOK: "Ever wondered if your videos could do more for you? Imagine having a personal video coach."
GOOD HOOK: "I posted a video last week. Spent two days on it. Got 11 views. And I had no idea why."

BAD SECTION TEXT: "Then I found something that changed everything." when your script says "So I tried uploading one video. Just one. And what came back stopped me."
GOOD SECTION TEXT: "So I tried uploading one video. Just one. And what came back stopped me." — exact copy from the script.

BAD ENDING: script ends at "Then I found something that changed everything." — incomplete, no CTA, no follow-through
GOOD ENDING: "It's free to try. Link is below. Go upload your first video and see what comes back."

JSON structure:
{
  "script": "Complete script, first word to last word",
  "title": "Specific video title, no hype words, under 70 chars",
  "sections": [
    {
      "start": "0:00",
      "end": "0:15",
      "label": "Hook",
      "text": "Exact words from script for this section, copied verbatim",
      "camera_angle": "Close-up, leaning slightly forward, direct eye contact",
      "broll": "",
      "presentation_tip": "Say the number slowly, pause after it"
    },
    {
      "start": "0:15",
      "end": "0:45",
      "label": "Problem",
      "text": "Exact words from script for this section, copied verbatim",
      "camera_angle": "Medium shot, relaxed posture",
      "broll": "",
      "presentation_tip": "Slow down here, speak like you actually lived this"
    }
  ],
  "teleprompter_ready": true,
  "summary": "One sentence describing what was created or changed"
}`;

// ─── Section label rewriter ───────────────────────────────────────────────────

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
  out = out.replace(/\u2014/g, ", ");
  return out;
}

// ─── Script completeness check ────────────────────────────────────────────────

const CTA_SIGNALS = [
  /\blink (is |'s )?(in |below|in the bio|in description)/i,
  /\btry it (free|out|today)/i,
  /\bsign up\b/i,
  /\bdownload\b/i,
  /\bcheck it out\b/i,
  /\bcomment below\b/i,
  /\bsubscribe\b/i,
  /\bfree (trial|version|plan)\b/i,
  /\bgive it a (try|go|shot)\b/i,
  /\bgo (try|check|upload|use)\b/i,
];

function scriptIsComplete(script: string): boolean {
  if (!script || script.trim().length < 100) return false;
  const secondHalf = script.slice(Math.floor(script.length / 2));
  return CTA_SIGNALS.some(rx => rx.test(secondHalf));
}

// ─── Section-script alignment ─────────────────────────────────────────────────
// The model is now instructed to write verbatim section texts. This function
// enforces that guarantee: it rebuilds section texts by splitting the actual
// script sequentially, ensuring the joined sections always equal the script.
// It uses the section count and labels from the model but ignores the text
// field if it doesn't appear verbatim in the script.

function alignSectionsToScript(
  script: string,
  sections: Array<{
    start: string; end: string; label?: string; text: string;
    camera_angle: string; broll: string; presentation_tip: string;
  }>
): typeof sections {
  if (!sections.length || !script.trim()) return sections;

  // First pass: check if sections are already correctly verbatim by
  // attempting to find each section text in the script sequentially.
  // If ALL sections are found in order, keep them as-is.
  let cursor = 0;
  let allAligned = true;

  const aligned = sections.map((section) => {
    const sectionText = (section.text ?? "").trim();
    if (!sectionText) { allAligned = false; return section; }

    const idx = script.indexOf(sectionText, cursor);
    if (idx !== -1) {
      cursor = idx + sectionText.length;
      return section; // verbatim match found, keep it
    }
    allAligned = false;
    return section;
  });

  if (allAligned) {
    // Every section text found verbatim and in order — no repair needed
    return aligned;
  }

  // Second pass: model wrote paraphrased section texts. Rebuild by splitting
  // the script into equal-ish chunks, one per section, preserving sentence
  // boundaries where possible.
  const scriptWords = script.split(/\s+/).filter(Boolean);
  const totalWords = scriptWords.length;
  const totalSections = sections.length;

  // Calculate approximate word count per section (weight by timestamp if possible)
  const rebuilt = sections.map((section, i) => {
    const startFraction = i / totalSections;
    const endFraction = (i + 1) / totalSections;
    const startWord = Math.floor(startFraction * totalWords);
    const endWord = Math.min(Math.floor(endFraction * totalWords), totalWords);

    // Expand to nearest sentence boundary
    let start = startWord;
    let end = endWord;

    // Walk start backwards to a sentence end (. ! ?) if not at 0
    if (i > 0) {
      for (let w = startWord; w > Math.max(0, startWord - 10); w--) {
        if (/[.!?]$/.test(scriptWords[w - 1] ?? "")) {
          start = w;
          break;
        }
      }
    }

    // Walk end forward to a sentence end
    if (i < totalSections - 1) {
      for (let w = endWord; w < Math.min(totalWords, endWord + 10); w++) {
        if (/[.!?]$/.test(scriptWords[w - 1] ?? "")) {
          end = w;
          break;
        }
      }
    } else {
      end = totalWords; // last section always goes to the end
    }

    return {
      ...section,
      text: scriptWords.slice(start, end).join(" "),
    };
  });

  // Ensure no gaps: stitch any missed words back into adjacent sections
  // by verifying the join equals the script
  const joined = rebuilt.map(s => s.text).join(" ");
  const scriptNorm = script.replace(/\s+/g, " ").trim();
  const joinedNorm = joined.replace(/\s+/g, " ").trim();

  if (joinedNorm !== scriptNorm && rebuilt.length > 0) {
    // Last resort: give the entire script to the last section's text won't
    // work, so instead redistribute: split script evenly by word count with
    // no sentence-boundary adjustment and no overlap.
    const wordsPerSection = Math.ceil(totalWords / totalSections);
    return sections.map((section, i) => ({
      ...section,
      text: scriptWords.slice(i * wordsPerSection, (i + 1) * wordsPerSection).join(" "),
    }));
  }

  return rebuilt;
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

  // FIX: Raised free plan token limit so a complete script + sections JSON
  // can actually fit. 1500 was too small for the JSON structure required.
  const maxTokens = isFree ? 2500 : isCreator ? 4000 : 6000;

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
    await logTokenUsage({
      userId: req.auth!.user_id,
      feature: "contentCreation",
      model,
      ...usageTokens(completion.usage),
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

    let script = parsed.script ?? "";
    let sections = Array.isArray(parsed.sections) ? parsed.sections : [];

    if (!script) {
      res.status(500).json({ error: "AI did not return a script. Please try again." });
      return;
    }

    // If the script is incomplete, request a single retry with explicit instruction
    if (!isFree && !scriptIsComplete(script)) {
      req.log.warn({ scriptLength: script.length }, "Script appears incomplete, retrying with completion prompt");
      try {
        const retryCompletion = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            {
              role: "assistant",
              content: raw,
            },
            {
              role: "user",
              content: "The script is incomplete — it ends before the CTA and Outro. Continue and complete it from where it left off. Add the How It Works section, a Proof or Result moment, a clear CTA telling the viewer exactly what to do (try the free version, link below), and a natural Outro sign-off. Update the sections array to include these new beats with their camera_angle, broll, and presentation_tip. IMPORTANT: section text fields must be copied verbatim from the script, not paraphrased. Return the full updated JSON.",
            },
          ],
          max_completion_tokens: maxTokens,
          response_format: { type: "json_object" },
        });
        await logTokenUsage({
          userId: req.auth!.user_id,
          feature: "contentCreation",
          model,
          ...usageTokens(retryCompletion.usage),
        });

        const retryRaw = retryCompletion.choices[0]?.message?.content ?? "{}";
        try {
          const retryParsed = JSON.parse(retryRaw);
          if (retryParsed.script && retryParsed.script.length > script.length) {
            script = retryParsed.script;
            sections = Array.isArray(retryParsed.sections) ? retryParsed.sections : sections;
            parsed.title = retryParsed.title ?? parsed.title;
            parsed.summary = retryParsed.summary ?? parsed.summary;
          }
        } catch {
          // Retry parse failed — continue with original
        }
      } catch (retryErr) {
        req.log.warn({ retryErr }, "Script completion retry failed, using original");
      }
    }

    // Post-process: sanitize hype words
    const cleanScript = sanitizeScript(script);
    const rawSections = sections.map(s => ({
      ...s,
      label: sanitizeSectionLabel(s.label ?? ""),
      text: sanitizeScript(s.text ?? ""),
      camera_angle: s.camera_angle ?? "",
      broll: s.broll ?? "",
      presentation_tip: s.presentation_tip ?? "",
    }));

    // Align section texts to the actual script (enforce verbatim match)
    const cleanSections = alignSectionsToScript(cleanScript, rawSections);

    // FIX: Free plan was slicing to 1 section, which showed a one-section
    // shooting plan with no useful structure. Now shows up to 3 sections
    // (Hook, Problem, CTA) so the free plan still has a meaningful preview
    // while gating the full shooting plan behind paid tiers.
    const sectionsToReturn = isFree ? cleanSections.slice(0, 3) : cleanSections;

    res.json({
      script: cleanScript,
      title: parsed.title ?? "",
      sections: sectionsToReturn,
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
