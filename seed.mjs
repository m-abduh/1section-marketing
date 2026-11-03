import { CATEGORY_PROMPTS } from "./services/category-prompts.mjs";

// Seed categories: one entry = a financial content format + the prompt that
// steers the AI to produce that format as GitHub-README-style Markdown.
//
// The renderer composes the final one-screen slide as:
//   # {nn} — {Category}
//   ---
//   ## {hook}      <- the headline/hook, written by the AI
//   {body}         <- the rest, written by the AI (this is what the prompt steers)
//
// Body rules for EVERY category (baked into each prompt below):
// - Plain flowing Markdown: **bold**, *italic*, ~~strikethrough~~, "- " lists,
//   and | tables | where the format calls for them.
// - NEVER use container blocks: no blockquotes (>) and no \`\`\`text code fences.
// - NEVER repeat the hook text anywhere in the body — the body must stand on its
//   own as a separate, non-redundant discussion (no wasted vertical space).
// - The hook may use inline styling (like **bold**) SPARINGLY on a key phrase,
//   but never bold the whole hook.
// - NEVER use emojis or emoticons — only text and numbers; use symbols
//   (× = ≠ ↓) ONLY when they carry meaning.
// - Keep lines short enough to fit on one 1080x1350 static frame.
// - Every claim must be financially/factually correct — no hype.

function readmeBody({ structure, example }) {
  return `Write the CONTENT BODY in plain, flowing Markdown. A headline (the "hook") already sits above as the H2 title; your body is everything after it — pure Markdown that renders beautifully on ONE static slide.

Structure to follow:
${structure}

Exact visual style to emulate (invent fresh content, never copy verbatim):
${example}

Rules: 100% Markdown, plain flowing body. Use only safe inline styling — **bold** (1-2 key words max, never a whole line), *italic*, ~~strikethrough~~, "- " lists, and | tables | when asked. NEVER use container blocks: no blockquotes (>) and no \`\`\`text code fences — write everything as plain paragraphs and lists. NEVER repeat the hook text anywhere in the body; the body must add new information, not echo the title. No emojis, no emoticons, text + numbers only, symbols (× = ≠ ↓) only where meaningful. Every line short enough for one screen. Correct financial theory and accurate numbers.

FUNNEL OVERRIDE (highest priority):
- The hook is a real problem + cause, not a statistic or a forced money example.
- The body tells the story of how the cause creates the problem. Do not put the fix, tip, audit, or next step in the body; it belongs in cta.
- The cta names the specific behavior to stop and the replacement behavior to start.
- The conclusion stays proportional to the body; do not introduce a new number or scale.`;
}
export const CATEGORY_SEEDS = [
  {
    name: "Story",
    default_prompt: readmeBody({
      structure: `A 2–3 step symbolic money chain, a dramatic turn, then the payoff line with the key word in **bold**.`,
      example: `**Work harder → Earn more → Become rich**

Until the question changes:

"Money becomes the **result**, not the goal."`,
    }),
  },
  {
    name: "Myth",
    default_prompt: readmeBody({
      structure: `Open with a ~~strikethrough~~ of the myth (paraphrased, never a repeat of the hook line), then the corrected truth with the key word in **bold**, then one final punchline line. No blockquote.`,
      example: `~~Earning more is the whole game.~~

Earning more helps, but **keeping** it is what builds wealth.

Most people earn more and lose more.`,
    }),
  },
  {
    name: "Contrarian",
    default_prompt: readmeBody({
      structure: `One contrarian one-liner, then a 3-step chain joined by ↓, then a verdict line with the key word in **bold**. No code fence, no blockquote.`,
      example: `You need **less friction**.

Smaller Task
↓
Easier Start
↓
More Repetition

Design the behavior. Don't depend on **motivation**.`,
    }),
  },
  {
    name: "Unpopular Truth",
    default_prompt: readmeBody({
      structure: `A blunt unpopular truth in short bold-flagged lines, then a blunt verdict line with the key word in **bold**. No blockquote.`,
      example: `The idea can be brilliant.

The design can be beautiful.

But if nobody needs it, **it doesn't matter**.

Customers buy **solutions**, not ideas.`,
    }),
  },
  {
    name: "Reframe",
    default_prompt: readmeBody({
      structure: `A ~~strikethrough~~ of the wrong belief, the right frame in **bold**, a "- " bullet list of what it reveals, then a plain closer line. No blockquote.`,
      example: `~~Failure = Losing~~

**Failure = Information**

It shows:

- What failed
- What was misunderstood
- What needs to change

Learn from it, then **move**.`,
    }),
  },
  {
    name: "Q&A",
    default_prompt: readmeBody({
      structure: `A stinging question line, a **X ≠ Y** contrast, a short explanation, then a plain two-line verdict. No blockquote.`,
      example: `Because:

**Knowing ≠ Doing**

You can understand everything and still take **zero action**.

Knowledge creates potential. Execution creates **results**.`,
    }),
  },
  {
    name: "Compare",
    default_prompt: readmeBody({
      structure: `Compare two opposing sides in a small | table | (2 columns × 3 short data rows), then a plain one-line verdict. No blockquote.`,
      example: `| Busy | Productive |
|---|---|
| Does more | Achieves more |
| Chases activity | Chases outcomes |
| Fills time | Creates value |

**Activity ≠ Progress**`,
    }),
  },
  {
    name: "Problem → Solution",
    default_prompt: readmeBody({
      structure: `"The problem might not be X" + a **bold** alternative, then a 3-line "**X → Y**" chain, then a plain verdict line. No blockquote.`,
      example: `It might be the **system**.

**Distraction → Remove distraction**

**Complexity → Simplify**

**Friction → Reduce friction**

Change the **system**, not just the willpower.`,
    }),
  },
  {
    name: "Warning",
    default_prompt: readmeBody({
      structure: `A hard warning line, a short "- " list of red flags, "None of these prove **demand**", then a plain two-line verdict. No blockquote.`,
      example: `More features.

Better UI.

New logo.

None of these prove **demand**.

Building proves capability. **Selling** proves demand.`,
    }),
  },
  {
    name: "Tips",
    default_prompt: readmeBody({
      structure: `A rhetorical question, a reframe ("make the action **smaller**"), three short bold numbered lines, then a plain punchline. No blockquote.`,
      example: `Don't make the goal bigger.

Make the action **smaller**.

**1 page. 
5 minutes. 
1 repetition.**

Consistency starts when **starting** becomes easy.`,
    }),
  },
  {
    name: "Formula",
    default_prompt: readmeBody({
      structure: `One correct money formula as a SINGLE HORIZONTAL line of terms joined by × and = (terms on one line: A × B × C = Value — never stacked vertically), then a one-line reframe, then a plain verdict line. No code fence, no blockquote.`,
      example: `**Problem × People × Leverage = Value**

Don't just work more.

Create more value with the **same effort**.`,
    }),
  },
  {
    name: "Stat",
    default_prompt: readmeBody({
      structure: `A "**X = label**" contrast on two lines, a plain line, then a **bold** closer. No blockquote.`,
      example: `**Followers = Attention**

**Customers = Demand**

100 people who desperately need something can be worth more than **100,000 who don't care**.

**Relevance beats reach.**`,
    }),
  },
].map((seed) => ({
  ...seed,
  // The category-level prompt map is the single source of truth for the
  // angle + required visual shape. Keep the seed metadata (name/position) but
  // never let an old readmeBody override the current prompt on boot.
  default_prompt: CATEGORY_PROMPTS[seed.name] || seed.default_prompt,
}));

// Pre-rework seed categories that no longer exist in the new 12-category set.
// Removed on boot so the rotation only ever uses the new README-style formats.
export const LEGACY_SEED_NAMES = [
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
];