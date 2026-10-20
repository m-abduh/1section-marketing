// Seed accounts + per-account niche category prompts.
//
// Reads Buffer tokens from .env (ACCOUNT_<NAME>) and, for each account,
// rebuilds its account_categories rows with prompts tailored to that account's
// niche (e.g. finance vs technology). The global 12-category list is untouched;
// only per-account prompts differ so each channel sounds its own niche.
//
// Run: npm run seed:accounts   (or: node seed-accounts.mjs)

import "dotenv/config";
import { store } from "./db.mjs";

// ---------------------------------------------------------------------------
// Prompt builder shared by every niche. `niche` describes WHO and WHAT this
// account covers; the per-account category rows carry structure + example
// tailored to the niche. `niche` is injected verbatim so the AI always knows
// its lane and stays on-topic with concrete, current insight.
// ---------------------------------------------------------------------------
function nichePrompt(niche, category, structure, example) {
  return `You write ${niche.description} for a short-form video channel named ${niche.name}. Stay strictly inside this niche — every line must be about ${niche.name} topics, never generic or finance-flavored unless that IS the niche. Give a real, non-obvious insight the viewer can act on, and keep references CURRENT (real trends, tools, shifts, or patterns in this field today).

A headline (the "hook") already sits above as the H2 title; your body is everything after it — plain, flowing Markdown that renders on ONE static slide.

Category: ${category}

Structure to follow:
${structure}

Exact visual style to emulate (invent fresh ${niche.name} facts, never copy verbatim):
${example}

Rules: 100% Markdown, plain flowing body. Use only safe inline styling — **bold** (1-2 key words max, never a whole line), *italic*, ~~strikethrough~~, "- " lists, and | tables | when asked. NEVER use container blocks: no blockquotes (>) and no \`\`\`text code fences — write everything as plain paragraphs and lists. NEVER repeat the hook text anywhere in the body; the body must add new information, not echo the title. No emojis, no emoticons, text + numbers only, symbols (× = ≠ ↓) only where meaningful. Every line short enough for one screen. Claims must be factually correct for the niche — no hype, no misleading numbers.`;
}

// ---------------------------------------------------------------------------
// Niche definitions. Each niche maps the 12 global categories to a tailored
// (structure, example) pair so the AI writes on-topic for that channel.
// ---------------------------------------------------------------------------
const CATEGORIES = ["Story", "Myth", "Contrarian", "Unpopular Truth", "Reframe", "Q&A", "Compare", "Problem → Solution", "Warning", "Tips", "Formula", "Stat"];

function makeNiche(name, description, promptFor) {
  const niche = { name, description };
  return {
    name,
    prompts: CATEGORIES.map((category) => ({
      category,
      prompt: promptFor(category, niche),
    })),
  };
}

const NICHES = [
  makeNiche("1section.finance", "personal finance — saving, investing, budgeting, retirement, debt, taxes, and building wealth with correct money theory", (c, niche) => {
    const spec = {
      "Story": {
        structure: `A short personal money story arc (a 2–3 step symbol chain, a turning point, a payoff), ending with the key word in **bold**.`,
        example: `**Automate savings → Let it compound → Walk away**

Until something shifts:

"Patience becomes the **edge**, not the exception."`,
      },
      "Myth": {
        structure: `Open with a ~~strikethrough~~ money myth (paraphrased, never a repeat of the hook), then the corrected truth with the key word in **bold**, then one punchline.`,
        example: `~~You must time the market.~~

Timing rarely works; **time in** the market does.

Most people wait for the perfect moment and miss the best years.`,
      },
      "Contrarian": {
        structure: `One contrarian money one-liner, a 3-step chain joined by ↓, then a bold verdict.`,
        example: `Chasing yield is **not** the goal.

Save more
↓
Spend less on noise
↓
Let compounding run

The real win is **low cost + long time**.`,
      },
      "Unpopular Truth": {
        structure: `A blunt unpopular money truth, then a blunt verdict with the key word in **bold**.`,
        example: `A bigger salary usually comes with a bigger lifestyle.

More income, same or more spending — **it doesn't move the needle**.

Wealth is **saved**, not earned.`,
      },
      "Reframe": {
        structure: `A ~~strikethrough~~ of a wrong money belief, the right frame in **bold**, a short "- " list, then a plain closer.`,
        example: `~~Saving is about sacrifice.~~

**Saving is buying your future.**

It means:
- Fewer impulse buys
- An emergency cushion
- Options later

Every dollar saved is **freedom** on layaway.`,
      },
      "Q&A": {
        structure: `A stinging money question, a **X ≠ Y** contrast, a short explanation, then a plain two-line verdict.`,
        example: `Because:

**Income ≠ Wealth**

You can earn a lot and still be broke.

Wealth is what you **keep and grow**, not what you make.`,
      },
      "Compare": {
        structure: `Compare two money strategies in a small | table | (2 cols × 3 rows), then a plain one-line verdict.`,
        example: `| Saving | Investing |
|---|---|
| Safe | Grows |
| Beats nothing | Beats inflation |
| Principal fixed | Compounding |

**Invest what you can keep for decades.**`,
      },
      "Problem → Solution": {
        structure: `"The money problem might not be X" + a **bold** alternative, a 3-line "**X → Y**" chain, then a plain verdict.`,
        example: `It might be the **budget**.

**No savings → Automatic transfer**

**No plan → One index fund**

**No tracking → Monthly review**

Fix the **system**, not the willpower.`,
      },
      "Warning": {
        structure: `A hard money warning, a short "- " list of red flags, "None of these prove **X**", then a plain two-line verdict.`,
        example: `High yield. "Guaranteed". Now.

- Double-digit promises
- Pressure to act fast
- No real product behind it

None of these prove **safety**.

If it's too good to be true, **walk away**.`,
      },
      "Tips": {
        structure: `A rhetorical money question, a reframe ("make the action **smaller**"), three short bold lines, then a plain punchline.`,
        example: `Feeling stuck on your savings?

Make the action **smaller**.

**$5 a day. 
1 account. 
1 monthly check.**

Consistency beats **intensity**.`,
      },
      "Formula": {
        structure: `One correct money formula as a SINGLE HORIZONTAL line joined by × and =, a one-line reframe, then a plain verdict.`,
        example: `**Savings Rate × Time × Return = Wealth**

Don't chase the next hot tip.

Own broad assets and **hold** them.`,
      },
      "Stat": {
        structure: `A "**X = label**" contrast on two lines, a plain line, then a **bold** closer.`,
        example: `**Inflation = The silent tax**

**Investing = The antidote**

Cash loses value every year you leave it idle.

**Own assets that outrun inflation.**`,
      },
    }[c];
    return nichePrompt(niche, c, spec.structure, spec.example);
  }),

  makeNiche("1section.business", "business and entrepreneurship — starting and growing a company, offers, pricing, revenue, marketing, products, and scaling", (c, niche) => {
    const spec = {
      "Story": {
        structure: `A short business-founder story arc (a 2–3 step chain, a turning point, a payoff), ending with the key word in **bold**.`,
        example: `**Find a pain → Build a fix → Charge for it**

Until the market answers:

"The business becomes the **proof**, not the product."`,
      },
      "Myth": {
        structure: `Open with a ~~strikethrough~~ business myth (paraphrased, never a repeat of the hook), the corrected truth in **bold**, then one punchline.`,
        example: `~~You need a perfect launch.~~

Launching ugly is better than not launching.

Most businesses die from **never starting**, not a rough first week.`,
      },
      "Contrarian": {
        structure: `One contrarian business one-liner, a 3-step chain joined by ↓, then a bold verdict.`,
        example: `More hustle is **not** the answer.

Find demand
↓
Simplify the offer
↓
Sell to a tiny niche

Focus beats **spread**.`,
      },
      "Unpopular Truth": {
        structure: `A blunt unpopular business truth, then a blunt verdict with the key word in **bold**.`,
        example: `Your product doesn't matter if nobody has the problem.

Great features can't fix **no demand**.

Revenue is the **scoreboard**.`,
      },
      "Reframe": {
        structure: `A ~~strikethrough~~ of a wrong business belief, the right frame in **bold**, a short "- " list, then a plain closer.`,
        example: `~~Revenue = Success.~~

**Revenue = A signal, not proof.**

It hides:
- Churn
- Refunds
- One-time buyers

Profit answers the real question.`,
      },
      "Q&A": {
        structure: `A stinging business question, a **X ≠ Y** contrast, a short explanation, then a plain two-line verdict.`,
        example: `Because:

**Traffic ≠ Revenue**

Thousands of visits can still sell nothing.

Real growth converts **attention** into **paying customers**.`,
      },
      "Compare": {
        structure: `Compare two business approaches in a small | table | (2 cols × 3 rows), then a plain one-line verdict.`,
        example: `| Volume | Value |
|---|---|
| Cheaper | Pricier |
| More customers | Fewer, better |
| Churn risk | Loyal base |

**Serve fewer, charge more.**`,
      },
      "Problem → Solution": {
        structure: `"The business problem might not be X" + a **bold** alternative, a 3-line "**X → Y**" chain, then a plain verdict.`,
        example: `It might be the **offer**.

**Weak hook → Clear outcome**

**Fuzzy price → One simple price**

**No proof → Show results**

Fix the **offer**, not the ad spend.`,
      },
      "Warning": {
        structure: `A hard business warning, a short "- " list of red flags, "None of these prove **X**", then a plain two-line verdict.`,
        example: `"Get rich in 30 days!" Red flags everywhere.

- No product demo
- No real customers
- Front-loaded fees

None of these prove **a real business**.

A real business sells and **gets paid**.`,
      },
      "Tips": {
        structure: `A rhetorical business question, a reframe ("make the action **smaller**"), three short bold lines, then a plain punchline.`,
        example: `Don't know where to start?

Make the first step **smaller**.

**1 customer. 
1 offer. 
1 sale.**

Start ugly, get **paid**,
then improve.`,
      },
      "Formula": {
        structure: `One correct business formula as a SINGLE HORIZONTAL line joined by × and =, a one-line reframe, then a plain verdict.`,
        example: `**Price × Customers × Repeat = Revenue**

Don't focus on traffic alone.

Raise the **price** or the **repeat rate**.`,
      },
      "Stat": {
        structure: `A "**X = label**" contrast on two lines, a plain line, then a **bold** closer.`,
        example: `**Revenue = A snapshot**

**Margin = The truth**

A million in sales can still mean losing money.

**Profit is what actually pays you.**`,
      },
    }[c];
    return nichePrompt(niche, c, spec.structure, spec.example);
  }),

  makeNiche("1section.career", "careers and professional growth — skills, jobs, promotions, negotiating salary, networking, interviews, and building a career", (c, niche) => {
    const spec = {
      "Story": {
        structure: `A short career-growth story arc (a 2–3 step chain, a turning point, a payoff), ending with the key word in **bold**.`,
        example: `**Learn a skill → Do real work → Get noticed**

Until one moment shifts:

"Visible output becomes the **currency**, not the résumé."`,
      },
      "Myth": {
        structure: `Open with a ~~strikethrough~~ career myth (paraphrased, never a repeat of the hook), the corrected truth in **bold**, then one punchline.`,
        example: `~~More hours equals faster promotion.~~

Working longer rarely beats working smarter.

Promotions go to people who **solve visible problems**.`,
      },
      "Contrarian": {
        structure: `One contrarian career one-liner, a 3-step chain joined by ↓, then a bold verdict.`,
        example: `Job hopping isn't **disloyalty**.

Build a skill
↓
Prove it with work
↓
Let them bid for you

Skills are yours; **jobs are not**.`,
      },
      "Unpopular Truth": {
        structure: `A blunt unpopular career truth, then a blunt verdict with the key word in **bold**.`,
        example: `Nobody owes you a promotion just for showing up.

Doing your job is the baseline, not an achievement.

**Visibility** is how careers grow.`,
      },
      "Reframe": {
        structure: `A ~~strikethrough~~ of a wrong career belief, the right frame in **bold**, a short "- " list, then a plain closer.`,
        example: `~~Indispensable = Safe.~~

**Indispensable = Stuck.**

It means:
- No one can replace you
- So no one promotes you
- You can't leave

Be **valuable and replaceable**,
then grow.`,
      },
      "Q&A": {
        structure: `A stinging career question, a **X ≠ Y** contrast, a short explanation, then a plain two-line verdict.`,
        example: `Because:

**Experience ≠ Growth**

Ten years repeating one year isn't growth.

Growth is new **skills, scope, and proof**.`,
      },
      "Compare": {
        structure: `Compare two career paths in a small | table | (2 cols × 3 rows), then a plain one-line verdict.`,
        example: `| Generalist | Specialist |
|---|---|
| Broad | Deep |
| Flexible | Rare |
| Crowded | Priced well |

**Go deep on a narrow skill.**`,
      },
      "Problem → Solution": {
        structure: `"The career problem might not be X" + a **bold** alternative, a 3-line "**X → Y**" chain, then a plain verdict.`,
        example: `It might be the **position**.

**Weak network → Talk to managers**

**No proof → Ship a project**

**Unclear ask → Ask directly**

Manage your **career**, not your job.`,
      },
      "Warning": {
        structure: `A hard career warning, a short "- " list of red flags, "None of these prove **X**", then a plain two-line verdict.`,
        example: `"Work 80 hours, we promise growth." Be cautious.

- No clear skill path
- Burnout is expected
- "Hustle culture" talk

None of these prove **growth**.

Real growth shows up as **skills
and pay**.`,
      },
      "Tips": {
        structure: `A rhetorical career question, a reframe ("make the action **smaller**"), three short bold lines, then a plain punchline.`,
        example: `Feeling invisible at work?

Make the move **smaller**.

**1 skill a month. 
1 visible project. 
1 conversation.** 

Growth follows **visible**
consistency.`,
      },
      "Formula": {
        structure: `One correct career formula as a SINGLE HORIZONTAL line joined by × and =, a one-line reframe, then a plain verdict.`,
        example: `**Skill × Proof × Network = Leverage**

Don't just collect certificates.

Produce work people can **see**.`,
      },
      "Stat": {
        structure: `A "**X = label**" contrast on two lines, a plain line, then a **bold** closer.`,
        example: `**Years = Tenure**

**Skills = Value**

Loyalty alone won't raise your worth.

**Become the rare skill** people pay for.`,
      },
    }[c];
    return nichePrompt(niche, c, spec.structure, spec.example);
  }),

  makeNiche("1section.technology", "technology — current and emerging tech, AI, software, gadgets, apps, cybersecurity, tooling, and how tech shapes the world today", (c, niche) => {
    const spec = {
      "Story": {
        structure: `A short, true-to-life tech story arc about a real product, update, bug, or shift (a 2–3 step chain, a turning point, a payoff), ending with the key word in **bold**. Keep it about an actual, current technology or trend.`,
        example: `**One scraping script → A dead site → Public backlash**

Then the lesson lands:

"AI can build anything, but it can't rebuild **trust**."`,
      },
      "Myth": {
        structure: `Open with a ~~strikethrough~~ tech myth people actually believe (paraphrased, never a repeat of the hook), the corrected truth in **bold**, then one punchline rooted in how the tech really works.`,
        example: `~~AI will soon replace every developer.~~

Models write code, but **humans** decide what to build and why.

The work is shifting from writing code to **judging** it.`,
      },
      "Contrarian": {
        structure: `One contrarian tech take that goes against the hype, a 3-step chain joined by ↓, then a bold verdict. Must reference current tech reality.`,
        example: `Hitting every AI feature is **not** a moat.

Ship one tool
↓
Let people rely on it
↓
Improve the daily habit

A habit beats a **feature list**.`,
      },
      "Unpopular Truth": {
        structure: `A blunt, unpopular truth about modern technology, then a blunt verdict with the key word in **bold**. Stay tech-specific.`,
        example: `Your LLM output is only as good as the **context** you give it.

Average prompts give average answers.

Garbage in, **garbage out** still holds in the AI age.`,
      },
      "Reframe": {
        structure: `A ~~strikethrough~~ of a wrong tech belief, the right frame in **bold**, a short "- " list of what it reveals, then a plain closer. Must be about real tech.`,
        example: `~~Shiny new device = Smarter you.~~

**The tool you master shapes your output.**

It decides:
- How fast you ship
- How much you automate
- How well you focus

Depth beats **device count**.`,
      },
      "Q&A": {
        structure: `A stinging tech question, a **X ≠ Y** contrast drawn from how systems really behave, a short explanation, then a plain two-line verdict.`,
        example: `Because:

**More data ≠ Better output**

Unclean, biased data makes models **lie confidently**.

Garbage training data means **garbage predictions**, at scale.`,
      },
      "Compare": {
        structure: `Compare two real tech approaches or products in a small | table | (2 cols × 3 rows), then a plain one-line verdict. Name real, recognizable tech.`,
        example: `| Local AI | Cloud AI |
|---|---|
| Private | Powerful |
| Runs offline | Needs internet |
| Chest-tight limits | Big context |

**Know what your data tolerates first.**`,
      },
      "Problem → Solution": {
        structure: `"The tech problem might not be X" + a **bold** alternative, a 3-line "**X → Y**" chain, then a plain verdict. Use concrete tech-system thinking.`,
        example: `It might be the **prompt**, not the model.

**Vague ask → Exact format**

**No examples → Give 3 examples**

**No feedback → Iterate in a loop**

Engineer the **context**, not the code.`,
      },
      "Warning": {
        structure: `A hard warning about a real tech risk (scam, security, privacy, hype), a short "- " list of red flags, "None of these prove **X**", then a plain two-line verdict.`,
        example: `"Free AI that needs your bank card." Big red flag.

- Asks for card up front
- No privacy policy
- "Limited offer" pressure

None of these prove **it's legit**.

Real tools show **what they do with your data**.`,
      },
      "Tips": {
        structure: `A rhetorical tech question, a reframe ("make the change **smaller**"), three short bold lines, then a plain punchline. Practical, specific.`,
        example: `Every day buried in manual work?

Make the fix **smaller**.

**1 script. 
1 shortcut. 
1 locked-in habit.**

Compound **small automations**,
not tools.`,
      },
      "Formula": {
        structure: `One correct tech or AI formula as a SINGLE HORIZONTAL line joined by × and =, a one-line reframe, then a plain verdict. Must feel tech-native.`,
        example: `**Skill × Automation × Focus = Output**

Don't hoard every new tool.

Automate what repeats and **focus** the rest.`,
      },
      "Stat": {
        structure: `A "**X = label**" contrast on two lines rooted in real tech behavior, a plain line, then a **bold** closer.`,
        example: `**Tools = Potential**

**Usage = Value**

A hundred installed apps mean nothing unused.

**Use fewer, better** — and know why each earns its place.`,
      },
    }[c];
    return nichePrompt(niche, c, spec.structure, spec.example);
  }),
];

// Official/general account: reuse the global default category prompts so it
// stays generic (covers all niches).
import { CATEGORY_SEEDS } from "./seed.mjs";

function officialPrompts() {
  return CATEGORY_SEEDS.map((s) => ({ category: s.name, prompt: s.default_prompt }));
}

// ---------------------------------------------------------------------------
// Account definitions. Name (Buffer account name) -> env var that holds its
// Buffer token. Order here sets their rotation position (explicit position).
// ---------------------------------------------------------------------------
const ACCOUNTS = [
  { name: "1section.investing", link: "investing.1section.com", tokenEnv: "ACCOUNT_1SECTION_INVESTING", prompts: officialPrompts() },
  { name: "1section.finance", link: "finance.1section.com", tokenEnv: "ACCOUNT_1SECTION_FINANCE", prompts: NICHES[0].prompts },
  { name: "1section.business", link: "business.1section.com", tokenEnv: "ACCOUNT_1SECTION_BUSINESS", prompts: NICHES[1].prompts },
  { name: "1section.career", link: "career.1section.com", tokenEnv: "ACCOUNT_1SECTION_CAREER", prompts: NICHES[2].prompts },
  { name: "1section.technology", link: "technology.1section.com", tokenEnv: "ACCOUNT_1SECTION_TECHNOLOGY", prompts: NICHES[3].prompts },
  { name: "1section.psychology", link: "psychology.1section.com", tokenEnv: "ACCOUNT_1SECTION_PSYCHOLOGY", prompts: officialPrompts() },
  { name: "1section.relationship", link: "relationship.1section.com", tokenEnv: "ACCOUNT_1SECTION_RELATIONSHIP", prompts: officialPrompts() },
];

function upsertAccount(account, position) {
  let existing = store.listAccounts().find((a) => a.name === account.name);
  if (!existing) {
    existing = store.createAccount({
      name: account.name,
      buffer_token: process.env[account.tokenEnv] || "",
      link: account.link || "",
    });
  } else {
    store.updateAccount(existing.id, {
      name: account.name,
      buffer_token: process.env[account.tokenEnv] || existing.buffer_token,
      link: account.link || existing.link,
    });
  }

  // Build category pairs: category_id + prompt, positioned in global category order.
  const pairs = account.prompts
    .map((p) => {
      const cat = store.listCategories().find((c) => c.name === p.category);
      return cat ? { category_id: cat.id, prompt: p.prompt, position: cat.position } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position)
    .map((p, i) => ({ ...p, position: i }));

  store.syncAccountCategories(existing.id, pairs);
  return existing;
}

let failed = 0;
ACCOUNTS.forEach((account, i) => {
  const token = process.env[account.tokenEnv];
  if (!token) {
    console.error(`[seed-accounts] SKIP ${account.name}: env ${account.tokenEnv} not set`);
    failed++;
    return;
  }
  const acc = upsertAccount(account, i);
  console.log(`[seed-accounts] ok ${acc.name} (#${acc.id})  token=${token ? "set" : "MISSING"} prox counts=${account.prompts.length}`);
});

// Re-sync positions to match declared order, keeping any other accounts after them.
const allAccounts = store.listAccounts();
const declaredIds = ACCOUNTS.map((a) => allAccounts.find((x) => x.name === a.name)?.id).filter(Boolean);
const extras = allAccounts.filter((a) => !ACCOUNTS.some((x) => x.name === a.name)).map((a) => a.id);
store.reorderAccounts([...declaredIds, ...extras]);

console.log(`\n[seed-accounts] done. ${ACCOUNTS.length} accounts declared, ${failed} skipped (missing token in .env).`);
console.log("Accounts:", store.listAccounts().map((a) => a.name).join(", "));
