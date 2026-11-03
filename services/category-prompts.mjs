// Category-level prompts. The base prompt (services/base-prompt.mjs) owns the
// global funnel, language, and safety rules. These entries only define the
// ANGLE and the REQUIRED VISUAL SHAPE for each category so every post has a
// real visual block (quote, table, list, chain, or formula), not just prose.

const shared = `HOOK: Real problem + actual cause in second person. No forced number, statistic, or third-person label.
CTA: Name the specific behavior to stop and the replacement behavior to start. The link follows.`;

export const CATEGORY_PROMPTS = {
  "Reframe": `CATEGORY ANGLE: Reframe a wrong belief the viewer carries about money, work, or relationships.
STORY SHAPE: Show the old belief in action, the moment it fails, and the cost. End on the new frame as an insight, not a tip.
VISUAL SHAPE: Use a compact 2-column table (Old frame | New frame) with 2 to 3 rows, then one short insight paragraph. The table is the required visual.
${shared}`,

  "Common Mistake": `CATEGORY ANGLE: Reveal a mistake the viewer is probably making without realizing it.
STORY SHAPE: Show the mistake in action, why it feels normal, and the cost. End on the consequence, not a correction.
VISUAL SHAPE: Use a 3-item list of what the mistake costs, then one short insight paragraph. The list is the required visual.
${shared}`,

  "Myth Busted": `CATEGORY ANGLE: Challenge a widespread belief that sounds true but quietly causes bad decisions.
STORY SHAPE: Show the myth in action, why it survives, and the cost. Replace it with a precise truth.
VISUAL SHAPE: Use a one-level blockquote for the myth, then 2 short paragraphs for the correction. The blockquote is the required visual.
${shared}`,

  "Hard Truth": `CATEGORY ANGLE: Say the uncomfortable truth the viewer needs to hear, with enough care that it lands.
STORY SHAPE: Show the moment the viewer avoids the truth, then the cost of avoiding it. End on the truth as an insight.
VISUAL SHAPE: Use a one-level blockquote for the hard truth, then 2 short paragraphs. The blockquote is the required visual.
${shared}`,

  "Quick Fix": `CATEGORY ANGLE: Show a small change that makes a real problem feel manageable.
STORY SHAPE: Show the problem, the cause, and the moment the old behavior fails. End on the insight. The fix belongs in cta.
VISUAL SHAPE: Use a 3-step vertical down-arrow chain for the old loop, then one short insight paragraph. The chain is the required visual.
${shared}`,

  "Warning Signs": `CATEGORY ANGLE: Help the viewer recognize early signs that something is starting to go wrong before it gets worse. Calm and specific, not alarmist.
STORY SHAPE: Show a real moment where the early sign appears, then the consequence if it repeats.
VISUAL SHAPE: Use a 3-item checklist of early signs, then one short consequence paragraph. The checklist is the required visual.
${shared}`,

  "Say This": `CATEGORY ANGLE: Give the viewer a ready-to-use sentence for a real conversation.
STORY SHAPE: Show the moment the old sentence fails, then the cost of saying it. The new sentence is the insight.
VISUAL SHAPE: Use a one-level blockquote for the exact sentence, then one short paragraph on why it works. The blockquote is the required visual.
${shared}`,

  "Simple Rule": `CATEGORY ANGLE: Give the viewer one simple rule that changes a repeated decision.
STORY SHAPE: Show the decision going wrong, then the cost of having no rule. End on the rule as an insight.
VISUAL SHAPE: Use a one-level blockquote for the rule, then 2 short paragraphs. The blockquote is the required visual.
${shared}`,

  "Ask Yourself": `CATEGORY ANGLE: Help the viewer spot a blind spot through a few sharp questions.
STORY SHAPE: Show the moment the viewer avoids the question, then the cost of not asking it.
VISUAL SHAPE: Use a 3-item question list, then one short insight paragraph. The list is the required visual.
${shared}`,

  "Hidden Cost": `CATEGORY ANGLE: Reveal the cost behind a normal habit or decision the viewer is not counting.
STORY SHAPE: Show the small visible cost, then how the same behavior quietly multiplies. Make the cause a specific habit or default. Do not end the body with an audit, fix, or next step.
VISUAL SHAPE: Use a 3-step vertical down-arrow chain (small cost, repeated cost, real total), then one short insight paragraph. The chain is the required visual. Use one verified number in the body, never in the hook.
${shared}`,

  "Mini Scenario": `CATEGORY ANGLE: Drop the viewer into a real, recognizable moment that shows the trap and its cause.
STORY SHAPE: Start with a real moment, not "Imagine". Show the trigger, behavior, consequence, and insight. Do not put the move or fix in the body.
VISUAL SHAPE: Use a 3-step vertical down-arrow chain (trigger, behavior, consequence), then one short insight paragraph. The chain is the required visual.
${shared}`,

  "Stop Doing This": `CATEGORY ANGLE: Name a common behavior the viewer should stop, and show what it is costing them.
STORY SHAPE: Show the behavior in action, why it feels productive, and the cost. End on the consequence.
VISUAL SHAPE: Use a 3-item list of the hidden costs, then one short insight paragraph. The list is the required visual. The stop instruction belongs in cta.
${shared}`,

  "Story": `CATEGORY ANGLE: Tell a compact story about a normal behavior and its hidden consequence.
STORY SHAPE: Show the trigger, the behavior, and the consequence. End on the insight, not a tip.
VISUAL SHAPE: Use a 3-step vertical down-arrow chain (trigger, behavior, consequence), then one short insight paragraph. The chain is the required visual.
${shared}`,

  "Myth": `CATEGORY ANGLE: Bust a common myth about money, work, or relationships.
STORY SHAPE: Show the myth in action, then the cost of believing it. Replace it with a precise truth.
VISUAL SHAPE: Use a one-level blockquote for the myth, then 2 short paragraphs for the correction. The blockquote is the required visual.
${shared}`,

  "Contrarian": `CATEGORY ANGLE: Challenge the obvious advice the viewer keeps hearing.
STORY SHAPE: Show the obvious advice failing, then the real cause. End on the contrarian insight.
VISUAL SHAPE: Use a horizontal arrow chain (A → B → C), then one short insight paragraph. The chain is the required visual.
${shared}`,

  "Unpopular Truth": `CATEGORY ANGLE: State an uncomfortable truth the viewer rarely hears.
STORY SHAPE: Show the moment the truth becomes visible, then the cost of ignoring it.
VISUAL SHAPE: Use a 3-item list of what the truth changes, then one short insight paragraph. The list is the required visual.
${shared}`,

  "Q&A": `CATEGORY ANGLE: Answer a question the viewer is already asking.
STORY SHAPE: Show the wrong answer in action, then the cost. End on the real answer as an insight.
VISUAL SHAPE: Use a 2-line bold contrast (X ≠ Y), then 2 short paragraphs. The contrast is the required visual.
${shared}`,

  "Compare": `CATEGORY ANGLE: Compare two approaches that look similar but produce different outcomes.
STORY SHAPE: Show both approaches in one real moment, then the consequence of choosing the wrong one.
VISUAL SHAPE: Use a 2-column table with 3 rows, then one short insight paragraph. The table is the required visual.
ACCURACY: Compare behaviors or habits, not financial products with tax rules you might misstate. If you are not certain of a rule, leave it out.
${shared}`,

  "Problem → Solution": `CATEGORY ANGLE: Show that the obvious problem is not the real cause.
STORY SHAPE: Show the problem, the real cause, and the consequence of treating the wrong thing. The solution belongs in cta.
VISUAL SHAPE: Use a horizontal arrow chain for the wrong path, then one short paragraph for the real cause. The chain is the required visual.
${shared}`,

  "Warning": `CATEGORY ANGLE: Warn the viewer about a costly mistake before they commit to it.
STORY SHAPE: Show the warning sign in a real moment, then the consequence if it is ignored.
VISUAL SHAPE: Use a 3-item checklist of red flags, then one short consequence paragraph. The checklist is the required visual.
${shared}`,

  "Tips": `CATEGORY ANGLE: Show a small shift that makes a repeated behavior easier.
STORY SHAPE: Show the old loop, the cause, and the moment it fails. End on the insight. The tip belongs in cta.
VISUAL SHAPE: Use a 3-step vertical down-arrow chain for the old loop, then one short insight paragraph. The chain is the required visual.
${shared}`,

  "Formula": `CATEGORY ANGLE: Show the simple formula behind a result the viewer wants.
STORY SHAPE: Show the wrong formula in action, then the cost. End on the correct formula as the insight. Do not add action steps; the cta names the behavior.
VISUAL SHAPE: Use a single-line bold formula, then one short explanation paragraph. The formula is the required visual.
${shared}`,

  "Stat": `CATEGORY ANGLE: Replace a misleading number or comparison with a clearer truth.
STORY SHAPE: Show what the viewer thinks the number means, then what it actually changes. Use only a number you can verify; if you cannot, use a qualitative comparison instead.
VISUAL SHAPE: Use a two-line bold X = Y contrast, then one short paragraph. The contrast is the required visual. Never invent a statistic.
ACCURACY: If you do not have a verifiable number, compare two behaviors qualitatively and keep the visual as a bold contrast.
${shared}`,
};
