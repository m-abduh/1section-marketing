import { renderPost } from "./services/renderer.mjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "output");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const SAMPLES = [
  {
    name: "Story",
    hook: "The Moment Money Stops Being The Goal",
    content: `**Work harder → Earn more → Become rich**

Until the question changes:

> "What problem can be solved?"

Money becomes the **result**, not the goal.`,
  },
  {
    name: "Myth",
    hook: "“Working Harder Will Make You Rich.”",
    content: `~~More hours = More money~~

**Not necessarily.**

> Hard work matters. 
> Direction matters more.`,
  },
  {
    name: "Contrarian",
    hook: "You Don't Need More Motivation",
    content: `You need **less friction**.

\`\`\`text
Smaller Task
↓
Easier Start
↓
More Repetition
\`\`\`

> Design the behavior. Don't depend on motivation.`,
  },
  {
    name: "Unpopular Truth",
    hook: "Nobody Cares About Your Idea",
    content: `The idea can be brilliant.

The design can be beautiful.

But if nobody needs it:

> It doesn't matter.

Customers buy **solutions**, not ideas.`,
  },
  {
    name: "Reframe",
    hook: "Failure Isn't The Opposite Of Success",
    content: `~~Failure = Losing~~

**Failure = Information**

It shows:

- What failed
- What was misunderstood
- What needs to change

> Learn from it, then move.`,
  },
  {
    name: "Q&A",
    hook: "Why Do Smart People Still Fail?",
    content: `Because:

**Knowing ≠ Doing**

You can understand everything and still take **zero action**.

> Knowledge creates potential. 
> Execution creates results.`,
  },
  {
    name: "Compare",
    hook: "Busy vs Productive",
    content: `| Busy | Productive |
|---|---|
| Does more | Achieves more |
| Chases activity | Chases outcomes |
| Fills time | Creates value |

> Activity ≠ Progress`,
  },
  {
    name: "Problem → Solution",
    hook: "The Problem Might Not Be Discipline",
    content: `It might be the **system**.

**Distraction → Remove distraction**

**Complexity → Simplify**

**Friction → Reduce friction**

> Change the system, not just the willpower.`,
  },
  {
    name: "Warning",
    hook: "Stop Building If Nobody Has Tried To Buy",
    content: `More features.

Better UI.

New logo.

None of these prove **demand**.

> Building proves capability. 
> Selling proves demand.`,
  },
  {
    name: "Tips",
    hook: "Want To Become More Consistent?",
    content: `Don't make the goal bigger.

Make the action **smaller**.

**1 page. 
5 minutes. 
1 repetition.**

> Consistency starts when starting becomes easy.`,
  },
  {
    name: "Formula",
    hook: "Wealth Is A Simple Equation",
    content: `\`\`\`text
Problem × People × Leverage = Value
\`\`\`

Don't just work more.

> Create more value with the same effort.`,
  },
  {
    name: "Stat",
    hook: "1,000 Followers ≠ 1,000 Customers",
    content: `**Followers = Attention**

**Customers = Demand**

100 people who desperately need something can be worth more than:

> 100,000 people who don't care.

**Relevance beats reach.**`,
  },
];

const ACCOUNT = "1section.finance";
const ACCOUNT_LINK = "finance.1section.com";

// Sample takeaways for the CTA end card (the real pipeline gets these from the AI).
const CONCLUSIONS = {
  "Story": "Money follows the problems you learn to solve.",
  "Myth": "Effort without direction just makes the wrong path shorter.",
  "Contrarian": "Design the behavior first, then rely on motivation.",
  "Unpopular Truth": "People pay for outcomes, not for how clever the idea is.",
  "Reframe": "Every failure hands you information you can act on.",
  "Q&A": "Knowledge creates potential; execution creates results.",
  "Compare": "Activity fills the day, outcomes build the business.",
  "Problem → Solution": "Change the system before blaming your willpower.",
  "Warning": "Capability is easy to prove; demand is what you need.",
  "Tips": "Starting small is what makes consistency possible.",
  "Formula": "Value comes from solving a real problem at scale.",
  "Stat": "A thousand followers means nothing without demand.",
};

async function main() {
  let i = 1;
  for (const s of SAMPLES) {
    const ts = Date.now();
    const out = join(OUT, `${s.name}-${ts}.mp4`);
    console.log(`\n[${i}/${SAMPLES.length}] Rendering "${s.name}" (${s.hook}) ...`);
    try {
      await renderPost({ hook: s.hook, content: s.content, category: s.name, account: ACCOUNT, account_link: ACCOUNT_LINK, conclusion: CONCLUSIONS[s.name] }, out);
      console.log(`  ✅ ${s.name} done in ${((Date.now() - ts) / 1000).toFixed(1)}s -> ${out}`);
    } catch (e) {
      console.error(`  ❌ ${s.name} FAILED: ${e.message}`);
    }
    i++;
  }
  console.log(`\n=== Finished ${SAMPLES.length} renders ===`);
}

main();
