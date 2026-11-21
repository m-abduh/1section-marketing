// Category-level prompts for simple 10:16 block visuals (blocks 2,5,7,8,15,19,26).
// Base prompt owns global rules. These only set ANGLE and preferred block(s); content must fit product + niche.

const RULE = `Output JSON with hook, content (ONE sentence, real felt problem, no "you" focus), visual {block_id:"reality-card", block:{main:"sentence with [[highlight]]"}}, caption, conclusion (ONE clear footer sentence, max ~14 words, clarifies the content point), cta "", recommendation "", product_points [], source "".
Use only the single reality-card layout for all content.`;

const P = (angle, _blocks, hint) => `CATEGORY ANGLE: ${angle}
CONTENT HINT: ${hint}
${RULE}`;

export const CATEGORY_PROMPTS = {
  "Reframe": P("Reframe a familiar belief to reveal the real feeling underneath.", "wrong-right, split, equation, center-statement, chat", "Surface belief vs lived reality; calm insight."),
  "Common Mistake": P("A quiet mistake people keep repeating without noticing.", "numbered, wrong-right, center-statement, split, big-word", "Show the pattern and the feeling it creates."),
  "Myth Busted": P("A belief that sounds right but hurts in practice.", "wrong-right, chat, center-statement, split, big-word", "Expose the gap between myth and lived experience."),
  "Hard Truth": P("An honest tension people avoid naming.", "center-statement, big-word, wrong-right, chat", "Gentle, respectful, deeply relatable; no blame."),
  "Quick Fix": P("A small shift that eases a real friction.", "equation, numbered, center-statement, split", "Name the friction and the relief of simplifying it."),
  "Warning Signs": P("Early signs a situation is quietly draining someone.", "numbered, wrong-right, split, center-statement, big-word", "Specific, calm signals people recognize."),
  "Say This": P("The difference between words that close and words that open.", "chat, wrong-right, center-statement, split, big-word", "Capture the moment communication misses the feeling."),
  "Simple Rule": P("One simple rule that eases a repeated tension.", "equation, center-statement, big-word, wrong-right", "Make a complex feeling feel lighter and clearer."),
  "Ask Yourself": P("A quiet tension that surfaces an inner conflict.", "chat, center-statement, big-word, numbered, split", "Invite reflection on a real inner conflict."),
  "Hidden Cost": P("The unseen cost of a normal habit or pressure.", "equation, split, numbered, center-statement, wrong-right", "Show what slowly drains time, energy, or peace."),
  "Mini Scenario": P("A small, recognizable moment that carries real weight.", "chat, split, center-statement, numbered, wrong-right", "One vivid moment, one feeling, no story arc."),
  "Stop Doing This": P("A draining pattern that feels normal but costs a lot.", "numbered, wrong-right, chat, center-statement, big-word", "Name the pattern and its quiet toll."),
  "Story": P("A single moment that captures a familiar struggle.", "chat, split, center-statement, equation", "One sentence snapshot of a real feeling."),
  "Myth": P("A common belief that doesn't match real experience.", "wrong-right, chat, center-statement, split, big-word", "Contrast belief with what actually happens."),
  "Contrarian": P("A surprising truth behind common advice.", "wrong-right, big-word, center-statement, split, chat", "Challenge gently; focus on lived reality."),
  "Unpopular Truth": P("A truth people sense but rarely say out loud.", "center-statement, big-word, numbered, wrong-right", "Honest, human, non-judgmental."),
  "Q&A": P("A doubt people carry and the clarity they feel.", "chat, wrong-right, center-statement, split, big-word", "Name the doubt and the relief of clarity."),
  "Compare": P("Two paths that feel very different inside.", "split, wrong-right, equation, chat, center-statement", "Contrast experiences, not abstractions."),
  "Problem → Solution": P("A real friction and the shift that eases it.", "equation, split, numbered, wrong-right", "Focus on felt relief, not instructions."),
  "Warning": P("A subtle sign that something is slipping.", "numbered, center-statement, wrong-right, big-word, split", "Calm, specific, recognizable."),
  "Tips": P("A small change that lightens a daily burden.", "numbered, equation, center-statement, big-word", "Practical feeling, not a checklist lecture."),
  "Formula": P("A simple pattern behind a common feeling.", "equation, wrong-right, big-word, center-statement", "Make the cause of the feeling clear."),
  "Stat": P("A reality that contrasts with what people assume.", "wrong-right, split, big-word, center-statement, numbered", "Use a clear contrast; do not invent numbers."),
};
