import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { marked } from "marked";

marked.setOptions({ breaks: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILDER = join(__dirname, "..", "builder");
const COMP_PATH = join(BUILDER, "_render.html");
const MUSIC_DIR = join(__dirname, "..", "music");

function findMusic() {
  if (!existsSync(MUSIC_DIR)) return null;
  const files = readdirSync(MUSIC_DIR).filter(f => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f));
  return files.length ? join(MUSIC_DIR, files[Math.floor(Math.random() * files.length)]) : null;
}

function renderTemplate(tpl, data) {
  tpl = tpl.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, block) => {
    const items = data[key];
    if (!Array.isArray(items)) return "";
    return items.map((item, idx) => {
      let out = block;
      out = out.replace(/\{\{@index\}\}/g, String(idx));
      out = out.replace(/\{\{@index1\}\}/g, String(idx + 1));
      if (typeof item === "string" || typeof item === "number") {
        return out.replace(/\{\{\.\}\}/g, String(item));
      }
      return out.replace(/\{\{(\w+)\}\}/g, (_, f) =>
        item[f] != null ? String(item[f]) : ""
      );
    }).join("");
  });
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    data[key] != null ? String(data[key]) : ""
  );
}

// Light "paper" backgrounds — subtle tints that keep a clean, readable surface.
// Only the background varies now (no colored content boxes).
const PAPER_FILLS = [
  "#f7f5f0",
  "#f5f4f2",
  "#f3f2ee",
  "#f6f1ea",
  "#efefec",
  "#f2f0ec",
  "#f4f2ef",
  "#f1f0ee",
];

// Try to fit the rendered markdown into the 1350px slide by scaling the
// markdown wrapper down when it would otherwise overflow. Keeps every item on one frame.
const FIT_SCRIPT = `
const __fit=()=>{const md=document.querySelector('.md');if(!md)return;const body=document.querySelector('.body');const avail=body.clientHeight;const h=md.offsetHeight;if(h>avail&&h>0){md.style.transform='scale('+(avail/h)+')';}};
try{__fit();}catch(e){}
`;

// Build the single full README-style markdown body for the slide:
//   ## {hook}\n\n{content body}
// No H1 banner or numeral is shown — the hook/headline and its discussion
// render as one continuous, focus-on-content markdown document.
export function buildMarkdown({ hook, body }) {
  return `## ${(hook || "").trim()}\n\n` + (body || "").trim();
}

export async function renderPost({ hook, content, category, account, account_link, content_text, index }, outputPath) {
  const htmlTpl = readFileSync(join(BUILDER, "unified.html"), "utf-8");
  const bg = PAPER_FILLS[Math.floor(Math.random() * PAPER_FILLS.length)];

  const bodyText = Array.isArray(content)
    ? content.join("\n")
    : (content_text || content || "");
  let md = buildMarkdown({ hook, body: bodyText });
  md = md.replace(/^(\*\*[^*\n]+)$/gm, (line) => (line.endsWith("**") ? line : line + "**"));
  const htmlContent = marked.parse(md).replace(/<input\b[^>]*>/gi, "");
  const data = {
    content: htmlContent,
    category: category || "",
    account: account || "",
    account_link: account_link || "",
    bg_fill: bg,
  };
  let html = renderTemplate(htmlTpl, data);

  html = html.replace("--paper:#f7f5f0", `--paper:${bg}`);

  // Fit-to-frame: scale the markdown wrapper down only when it overflows.
  html = html.replace(
    "window.__timelines=window.__timelines||{}",
    FIT_SCRIPT + "\nwindow.__timelines=window.__timelines||{}"
  );

  if (html.includes('<script id="cd"')) {
    html = html.replace(/<script id="cd"[^>]*>[\s\S]*?<\/script>\s*/g, "");
  }

  const musicFile = findMusic();
  if (musicFile) {
    const bgmPath = join(BUILDER, "_bgm.mp3");
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-y", "-i", musicFile,
        "-t", "15",
        "-af", "afade=t=out:st=11:d=4",
        "-c:a", "libmp3lame", "-q:a", "2",
        bgmPath
      ]);
      ff.on("close", c => c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)));
      ff.on("error", reject);
    });
    const audio = `<audio id="bgm" src="./_bgm.mp3" data-start="0" data-duration="15" data-volume="0.3" data-has-audio="true"></audio>`;
    html = html.replace("</div>", audio + "\n</div>");
  }

  writeFileSync(COMP_PATH, html, "utf-8");

  return new Promise((resolve, reject) => {
    const args = ["hyperframes", "render", BUILDER, "-c", "_render.html", "-o", outputPath, "--quality", "draft"];
    const child = spawn("npx", args);
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("render timed out")); }, 180000);
    child.stdout.on("data", d => process.stdout.write(d));
    child.stderr.on("data", d => process.stderr.write(d));
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`render exited ${code}`)); });
    child.on("error", err => { clearTimeout(timer); reject(err); });
  });
}
