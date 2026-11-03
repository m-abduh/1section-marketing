// Add the newer niche accounts without rebuilding the existing seven.
//
// Reads Buffer tokens from .env (ACCOUNT_1SECTION_<NAME>) and creates or
// updates only the accounts declared below. New accounts get the full global
// category list through the normal account sync; their niche topics are
// injected by services/niche-topics.mjs at generation time.
//
// Run: node seed-extra-accounts.mjs

import "dotenv/config";
import { store } from "./db.mjs";

const ACCOUNTS = [
  {
    name: "1section.learning",
    link: "learning.1section.com",
    tokenEnv: "ACCOUNT_1SECTION_LEARNING",
  },
  {
    name: "1section.parenting",
    link: "parenting.1section.com",
    tokenEnv: "ACCOUNT_1SECTION_PARENTING",
  },
];

let failed = 0;

for (const account of ACCOUNTS) {
  const token = process.env[account.tokenEnv];
  if (!token) {
    console.error(`[seed-extra] SKIP ${account.name}: env ${account.tokenEnv} not set`);
    failed++;
    continue;
  }

  const existing = store.listAccounts().find((a) => a.name === account.name);
  if (existing) {
    store.updateAccount(existing.id, {
      name: account.name,
      buffer_token: token,
      link: account.link,
    });
    console.log(`[seed-extra] updated ${account.name} (#${existing.id})`);
  } else {
    const created = store.createAccount({
      name: account.name,
      buffer_token: token,
      link: account.link,
    });
    console.log(`[seed-extra] created ${created.name} (#${created.id})`);
  }
}

// Keep every account aligned with the current global category list. This only
// fills missing category rows and preserves existing per-account prompts.
store.syncAllAccountCategories();

console.log(
  `[seed-extra] done. ${ACCOUNTS.length - failed}/${ACCOUNTS.length} accounts ready.`
);
console.log("Accounts:", store.listAccounts().map((a) => a.name).join(", "));
