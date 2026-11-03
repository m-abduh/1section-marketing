// Approved topic bank for the newer niche accounts.
//
// These topics are injected into the AI prompt at generation time so every post
// is grounded in a real, recognizable problem. Existing niche accounts are left
// untouched on purpose: only accounts listed here receive the extra topic block.
//
// Prompt data only. This module does not touch rotation, scheduling, rendering,
// or posting.

export const NICHE_TOPICS = {
  learning: [
    "A student turns in strong AI-assisted assignments but cannot explain a single answer a week later.",
    "Rereading notes five times feels productive, yet the material still disappears on test day.",
    "Highlighting an entire textbook page creates the feeling of studying without any real recall.",
    "Self-testing feels harder than rereading, so most people quit before it starts working.",
    "A student asks AI for the answer the moment a problem gets uncomfortable, so the struggle that builds understanding never happens.",
    "Watching a short video on a topic creates the feeling of knowing it, until one simple question exposes the gaps.",
    "Reading more than a few pages feels exhausting because attention keeps jumping back to the phone.",
    "Notifications interrupt study sessions every few minutes, so an hour at the desk produces twenty minutes of real learning.",
    "An adult wants to learn a new skill after work but ends up too tired and with no clear place to start.",
    "Paying for another certificate feels like progress, yet it often does little for pay when it does not match the job.",
    "Many workers call AI skills important, but few have started because they do not know where to begin.",
    "AI answers sound confident and fluent, so wrong explanations get accepted without being checked.",
    "Cramming the night before an exam produces a passing grade that is forgotten within days.",
    "A learner watches tutorials for weeks without ever building or writing anything of their own.",
    "Study groups feel productive when one strong student explains everything and the others only nod along.",
    "Switching study methods every week prevents any single habit from lasting long enough to work.",
    "A student decides they are just bad at a subject after a few poor results, instead of questioning how they have been studying.",
    "Skipping the basics because AI can handle them leaves gaps that make advanced topics impossible later.",
    "Saving articles, notes, and bookmarks feels like learning, but nothing is ever reviewed or used.",
    "Deciding which skills are still worth years of effort feels impossible when AI keeps changing what jobs require.",
  ],
  parenting: [
    "A child begs for a phone because every classmate already has one, and saying no feels like isolating them.",
    "Screen time rules get set on Monday and quietly collapse by Friday.",
    "A teenager is still on social media despite age limits, because the platforms are easy to get around.",
    "A teen talks to an AI chatbot about personal problems, and the parents have no idea.",
    "Parents have never talked with their teenager about how AI chatbots work and do not know how to start.",
    "A child gets homework answers from AI and appears to be learning while real understanding stays thin.",
    "Parents are too exhausted at the end of the day to be as patient as they want to be.",
    "Working from home while supervising children leaves both the work and the parenting feeling half done.",
    "A parent's career ambitions fade because childcare logistics and costs keep winning.",
    "Daily reading with young children gets squeezed out by tablets and busy evenings.",
    "A parent feels guilty for scrolling while telling the kids to put their phones down.",
    "Bedtime turns into a nightly fight over one more video.",
    "A toddler is calm with a screen and melts down without it, so the screen becomes the default calming tool.",
    "Parents feel isolated, with no one to ask whether what they are going through is normal.",
    "Online games with open chat make every gaming session feel risky.",
    "A teen pulls away and answers every question with one word, and the parent cannot tell if it is normal or a warning sign.",
    "Comparing a child's milestones with other families' posts creates doubt about whether the child is on track.",
    "Parents disagree on the rules, so the kids learn which parent to ask.",
    "The cost of raising children keeps outpacing the budget, forcing parents to cut their own needs first.",
    "Parents struggle to keep up with the apps and trends their children already know well.",
  ],
};

/**
 * Resolve a niche from a Buffer account name.
 * "1section.learning" -> "learning"; also tolerates spaces or extra words.
 */
export function nicheFromAccount(accountName = "") {
  const name = String(accountName).trim().toLowerCase();
  const suffix = name.includes(".") ? name.split(".").pop().trim() : name;
  if (NICHE_TOPICS[suffix]) return suffix;
  const found = Object.keys(NICHE_TOPICS).find((key) => name.includes(key));
  return found || suffix || "general";
}

export function topicsForAccount(accountName) {
  const niche = nicheFromAccount(accountName);
  return { niche, topics: NICHE_TOPICS[niche] || [] };
}
