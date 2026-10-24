// Seed categories: one entry = a content format + the prompt that steers the
// AI. All 12 categories apply to every niche; the niche-specific topic bank is
// injected at generation time from services/niche-topics.mjs.
//
// The renderer still composes the final slide as:
//   # {nn} — {Category}
//   ---
//   ## {hook}
//   {body}
//
// These prompts only steer the AI. Rotation, scheduling, rendering, Buffer
// posting, and the database schema stay unchanged.

const COMMON_RULES = `Write in natural, native English (US) only. No translated-sounding phrasing, no mixed languages, no generic AI-speak.
Choose exactly ONE topic from the NICHE TOPICS list supplied in the prompt. The whole post must stay on that one topic and inside that niche. Never switch niches and never invent an unrelated topic.
Make the viewer feel instantly seen ("this is so me") without shaming them. Be specific, accurate, and useful. Never invent statistics, quotes, or study results.
The brand has no personal history. Never write first-person brand testimony such as "I used to", "I spent months", "I know it feels", "my", or "we used to" as if the brand experienced it. Speak to the viewer as "you". Use "we/our/us" only in a general or conversational sense, never to claim personal experience. First-person is allowed only inside a direct quote the viewer can say.
Soften claims: never use "every time", "always", "everything changed", or "never fails" in any field, even inside a myth, hook, conclusion, or quote. Avoid "only" when it creates an absolute claim. Prefer "often", "can", "usually", "may", or "tends to".
Avoid exaggerated comparisons or false equivalence, such as "daily coffee costs more than rent". If you use arithmetic, keep it simple and accurate.
Use standard English number and currency formatting (20%, $1,200, 10 hrs), never localized formats like "20 %".
Include at most ONE real action per post. Do not stack steps or turn the body into a to-do list.
Keep the caption to about 20 to 40 words with one useful observation. Vary the close: invite a save, a send, or a comment, but never all three and never sound like an ad.
Do not use em dashes (—) or en dashes (–). Use periods, commas, or short sentences. Avoid AI-cliché phrases such as "in today's fast-paced world", "game-changer", "unlock", "dive in", "it's not just X, it's Y", and "here's the kicker".
Never use strikethrough formatting (do not wrap text in double tildes). For a myth, use a one-level blockquote starting with "Myth:" instead.
Write any subhead as a proper Markdown heading (### or ####) on its own line, followed by a blank line.
The "hook" is the title above the body. The body must add new information and must never repeat the hook.
Use the markdown shape that fits the category, and vary it from post to post. Keep the body under about 45 words so it fits one static slide.
Never wrap the body or multiple lines in inline backticks. Use a fenced code block only when the category specifically asks for a formula.
Before returning, reread the caption and body once and remove any first-person brand testimony, absolute claim, em dash, or strikethrough.`;

function categoryPrompt({ purpose, structure, example }) {
  return `CATEGORY BEHAVIOR
${purpose}

STRUCTURE TO FOLLOW
${structure}

ANGLE EXAMPLE (invent fresh content; never copy this line)
${example}

${COMMON_RULES}`;
}

export const CATEGORY_SEEDS = [
  {
    name: "Common Mistake",
    default_prompt: categoryPrompt({
      purpose:
        "Reveal a mistake the viewer is probably making without realizing it. Make the mistake feel normal, show the hidden consequence, then give the correction they can use today.",
      structure:
        "Name the mistake in one plain line. Show why it feels normal. Then reveal the cost in one short line and end with a concrete correction. A short list or a bold contrast works well; do not lecture.",
      example:
        "You wait until you feel ready. Readiness is built by starting smaller.",
    }),
  },
  {
    name: "Myth Busted",
    default_prompt: categoryPrompt({
      purpose:
        "Challenge a widespread belief that sounds true but quietly causes bad decisions. Replace it with an accurate, useful truth.",
      structure:
        "Open with the myth as a one-level blockquote starting with \"Myth:\" (paraphrased, never a repeat of the hook). Follow with a blank line, then the correction in one or two plain sentences. If useful, end with one small action. Never use strikethrough.",
      example:
        "> Myth: more hours means better work.\n\nRecovery is part of the work. A short break can protect the next hour.",
    }),
  },
  {
    name: "Hard Truth",
    default_prompt: categoryPrompt({
      purpose:
        "Say the uncomfortable truth the viewer needs to hear, with enough care that it lands instead of stinging. Direct, never cruel or doom-heavy.",
      structure:
        "State the hard truth in one or two short lines. Show the cost of ignoring it. End with the next honest step. No hedging, no false reassurance.",
      example:
        "Nobody is coming to rescue your schedule. You have to protect it.",
    }),
  },
  {
    name: "Quick Fix",
    default_prompt: categoryPrompt({
      purpose:
        "Give one small action the viewer can try immediately to make the problem feel more manageable. Low effort, clear payoff.",
      structure:
        "Give ONE concrete action, ideally doable in under 10 minutes. Explain what it changes in one short line. End there; do not turn it into a long list.",
      example:
        "Put the task where you can see it, then do the first two minutes.",
    }),
  },
  {
    name: "Warning Signs",
    default_prompt: categoryPrompt({
      purpose:
        "Help the viewer recognize early signs that something is starting to go wrong before it gets worse. Calm and specific, not alarmist.",
      structure:
        "Use a plain \"- \" list for 3-4 short, specific warning signs (not a checklist). End with one calm next-step line. If the topic involves health, safety, legal, or serious money risk, add one brief note to speak with a qualified professional.",
      example:
        "You sleep enough but still feel drained. Things you used to love feel flat.",
    }),
  },
  {
    name: "Say This",
    default_prompt: categoryPrompt({
      purpose:
        "Give the viewer a ready-to-use sentence for a real conversation with a boss, partner, friend, stranger, or themselves. Make it sound like a real person, not a script.",
      structure:
        "Put the exact sentence in a one-level blockquote. Explain in one short line why it works. If useful, add one tiny variation. Keep the wording natural and speakable.",
      example:
        '> "I need five minutes to think before I answer."',
    }),
  },
  {
    name: "Reframe",
    default_prompt: categoryPrompt({
      purpose:
        "Flip the meaning of a situation the viewer is stuck in. Replace a defeated story with a more useful frame that still respects how hard it feels.",
      structure:
        "Name the old story, then flip it with a clearer frame. Show what changes when they see it the new way. Keep the contrast tight; do not turn it into a motivational speech.",
      example:
        'Not "I am behind." Try "I am early in a longer game."',
    }),
  },
  {
    name: "Simple Rule",
    default_prompt: categoryPrompt({
      purpose:
        "Give one memorable rule the viewer can repeat from memory and apply the same day. Simple enough to stick, specific enough to matter.",
      structure:
        "State the rule in **bold**. Explain when to use it in one or two lines and what it protects the viewer from. No extra rules.",
      example:
        "**If it takes less than two minutes, do it now.**",
    }),
  },
  {
    name: "Ask Yourself",
    default_prompt: categoryPrompt({
      purpose:
        "Ask one honest question that interrupts autopilot and helps the viewer see what is really going on. Curious, not judgmental.",
      structure:
        "Put the question in a one-level blockquote. Explain why it matters in one short line, then show how to answer it honestly. Do not answer for the viewer.",
      example:
        '> "What am I avoiding, and what is that avoidance protecting?"',
    }),
  },
  {
    name: "Hidden Cost",
    default_prompt: categoryPrompt({
      purpose:
        "Reveal the cost behind a normal habit or decision that the viewer is not counting: money, time, energy, attention, or relationships.",
      structure:
        "Show the small visible cost, then the real multiplied cost. End with one simple way to audit or reduce it. Use a number only when it is accurate and easy to verify.",
      example:
        "A $4 daily habit is $1,460 a year.",
    }),
  },
  {
    name: "Mini Scenario",
    default_prompt: categoryPrompt({
      purpose:
        "Drop the viewer into a short, recognizable situation and show the trap and the move that changes the outcome. This replaces the old Story format.",
      structure:
        "Start with \"Imagine...\" and set the scene in 2-3 beats. Show the trap they could fall into, then the move that changes the outcome. No long narrative, no invented dialogue.",
      example:
        "Imagine your phone buzzes with an urgent request while you are already drowning.",
    }),
  },
  {
    name: "Stop Doing This",
    default_prompt: categoryPrompt({
      purpose:
        "Name one habit the viewer should stop, show the real cost, and replace it with a better behavior. Firm about the habit, never contemptuous toward the person.",
      structure:
        "Name the habit directly. Explain the cost in one or two lines. End with a specific replacement behavior the viewer can start today.",
      example:
        "Stop checking for reassurance every five minutes.",
    }),
  },
];

// Pre-rework seed categories that no longer exist in the new 12-category set.
// Removed on boot so the rotation only ever uses the current set. Both the
// capitalized names and older lowercase variants are listed for old installs.
export const LEGACY_SEED_NAMES = [
  "Story",
  "Myth",
  "Contrarian",
  "Unpopular Truth",
  "Q&A",
  "Compare",
  "Problem → Solution",
  "Warning",
  "Tips",
  "Formula",
  "Stat",
  "story",
  "tips",
  "steps",
  "myth",
  "compare",
  "q&a",
  "quote",
  "stat",
  "tierlist",
  "warning",
  "formula",
  "checklist",
  "contrarian",
  "unpopular truth",
  "problem → solution",
];
