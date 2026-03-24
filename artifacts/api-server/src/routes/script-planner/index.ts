import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.use(requireAuth);

const SYSTEM_PROMPT_FULL = `You are an expert content strategist and scriptwriter who works with top YouTube and social media creators.
Your job is to generate a professional, engaging video script based on the user's idea.

Rules:
- Write like a real human creator — conversational, punchy, and natural
- Never use robotic or AI-sounding phrases ("In today's video...", "Without further ado...")
- Open with a strong hook that grabs attention in the first 5 seconds
- Use proven storytelling structures (Problem → Agitate → Solve, Story → Lesson, etc.)
- Include natural pacing cues, pauses, emphasis
- Add influencer-style retention tricks (open loops, callbacks, curiosity gaps)
- Each section must include a concrete camera angle, B-roll idea, and a presentation tip

Return ONLY valid JSON matching this exact structure:
{
  "script": "Full word-for-word script ready to read on camera",
  "sections": [
    {
      "start": "0:00",
      "end": "0:15",
      "text": "The hook/opening words from the script",
      "camera_angle": "Specific angle or shot description",
      "broll": "Specific B-roll footage to show during this section",
      "presentation_tip": "One concrete delivery tip for this moment"
    }
  ],
  "teleprompter_ready": true
}`;

const SYSTEM_PROMPT_FREE = `You are an expert scriptwriter.
Generate a short, engaging video script based on the user's idea.

Rules:
- Write conversationally — no robotic AI phrases
- Include one strong hook at the start
- Keep it concise and punchy
- Add 1-2 camera tips

Return ONLY valid JSON:
{
  "script": "Full script text",
  "sections": [
    {
      "start": "0:00",
      "end": "0:20",
      "text": "Hook section",
      "camera_angle": "One camera angle tip",
      "broll": "",
      "presentation_tip": "One delivery tip"
    }
  ],
  "teleprompter_ready": true
}`;

router.post("/generate", async (req, res) => {
  const { idea } = req.body as { idea?: string };

  if (!idea || typeof idea !== "string" || idea.trim().length < 5) {
    res.status(400).json({ error: "Please provide a video idea (at least 5 characters)." });
    return;
  }

  if (idea.trim().length > 1000) {
    res.status(400).json({ error: "Video idea is too long. Keep it under 1000 characters." });
    return;
  }

  const plan = req.auth!.plan ?? "free";
  const isFree = plan === "free";
  const isPaid = plan === "premium" || plan === "professional";

  const systemPrompt = isFree ? SYSTEM_PROMPT_FREE : SYSTEM_PROMPT_FULL;
  const model = isPaid ? "gpt-4o" : "gpt-4o-mini";
  const maxTokens = isFree ? 1200 : 3500;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Video idea: ${idea.trim()}` },
      ],
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: {
      script?: string;
      sections?: Array<{
        start: string;
        end: string;
        text: string;
        camera_angle: string;
        broll: string;
        presentation_tip: string;
      }>;
      teleprompter_ready?: boolean;
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
      sections: isFree ? sections.slice(0, 1) : sections,
      teleprompter_ready: true,
      plan,
      full_plan: isPaid,
    });
  } catch (err) {
    req.log.error({ err }, "Script planner generation failed");
    res.status(500).json({ error: "Failed to generate script. Please try again." });
  }
});

export default router;
