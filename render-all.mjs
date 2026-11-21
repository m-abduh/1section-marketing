import { renderPost } from "./services/renderer.mjs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "output");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const ACCOUNT = "1section.learning";
const ACCOUNT_LINK = "learning.1section.com";
const NICHE = "Learning";

const SAMPLES = [
  {
    name: "reality-1",
    category: "Hard Truth",
    hook: "Quiet learning fatigue",
    content: "Ten open tabs, and nothing really stays.",
    visual: { block_id: "reality-card", block: { main: "Ten open tabs, and [[nothing really stays]]." } },
  },
  {
    name: "reality-2",
    category: "Unpopular Truth",
    hook: "Bookmark illusion",
    content: "Saved feels finished, but nothing changed.",
    visual: { block_id: "reality-card", block: { main: "Saved feels finished, but [[nothing changed]]." } },
  },
  {
    name: "reality-3",
    category: "Myth Busted",
    hook: "More courses",
    content: "Collecting more courses feels like progress, but nothing gets used.",
    visual: { block_id: "reality-card", block: { main: "More courses can feel like progress, but [[nothing gets used]]." } },
  },
];

async function main() {
  let i = 1;
  for (const s of SAMPLES) {
    const ts = Date.now();
    const out = join(OUT, `sample-${s.name}-${ts}.mp4`);
    console.log(`\n[${i}/${SAMPLES.length}] Rendering content "${s.name}" ...`);
    try {
      await renderPost(
        {
          hook: s.hook,
          content: s.content,
          visual: s.visual,
          category: s.category,
          account: ACCOUNT,
          account_link: ACCOUNT_LINK,
          niche: NICHE,
          index: i,
        },
        out
      );
      console.log(`  ✅ ${s.name} done -> ${out}`);
    } catch (e) {
      console.error(`  ❌ ${s.name} FAILED: ${e.message}`);
    }
    i++;
  }

  // Sales-only CTA sample (end-of-cycle format)
  const salesOut = join(OUT, `sample-sales-cta-${Date.now()}.mp4`);
  console.log(`\n[${i}/${SAMPLES.length + 1}] Rendering sales CTA ...`);
  try {
    await renderPost(
      {
        mode: "sales",
        sales_mode: true,
        category: "Sales CTA",
        account: ACCOUNT,
        account_link: ACCOUNT_LINK,
        niche: NICHE,
        hook: "Get Focused Learning Guide",
        content: "Sales CTA",
        conclusion: "A calmer way to learn with clarity.",
        cta: "Get the guide in bio",
        recommendation: "A simple guide for clearer, focused learning.",
        product_name: "Focused Learning Guide",
        product_points: [
          "Turn scattered effort into clear focus",
          "Simple steps for real daily routines",
          "Build progress that actually sticks",
        ],
        price: "$29",
        compare_price: "$49",
        discount: "40% OFF",
      },
      salesOut
    );
    console.log(`  ✅ sales CTA done -> ${salesOut}`);
  } catch (e) {
    console.error(`  ❌ sales CTA FAILED: ${e.message}`);
  }

  console.log(`\n=== Finished ${SAMPLES.length + 1} renders ===`);
}

main();
