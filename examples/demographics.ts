/**
 * Summarize the demographic mix of a list of names.
 *
 * Run a batch through each service, then aggregate the predictions into a
 * gender split, an age distribution, and a nationality mix. The output is a
 * summary of the group, not a label for any one person.
 *
 * Run: npx tsx examples/demographics.ts
 */

import { Demografix } from "../src/index.js";

const names = ["michael", "matthew", "jane", "nguyen", "kim", "peter"];

async function main(): Promise<void> {
  const client = new Demografix({ apiKey: process.env.DEMOGRAFIX_API_KEY });

  const [genders, ages, nationalities] = await Promise.all([
    client.genderizeBatch(names),
    client.agifyBatch(names),
    client.nationalizeBatch(names),
  ]);

  // Gender split across the list.
  const split: Record<string, number> = { male: 0, female: 0, unknown: 0 };
  for (const r of genders.results) {
    split[r.gender ?? "unknown"]! += 1;
  }

  // Age distribution by decade.
  const decades: Record<string, number> = {};
  for (const r of ages.results) {
    if (r.age === null) continue;
    const bucket = `${Math.floor(r.age / 10) * 10}s`;
    decades[bucket] = (decades[bucket] ?? 0) + 1;
  }

  // Nationality mix: most likely country per name, tallied.
  const countries: Record<string, number> = {};
  for (const r of nationalities.results) {
    const top = r.country[0]?.countryId;
    if (top) countries[top] = (countries[top] ?? 0) + 1;
  }

  console.log(`Analyzed ${names.length} names`);
  console.log("Gender split:", split);
  console.log("Age distribution:", decades);
  console.log("Nationality mix:", countries);
  console.log("Quota remaining:", genders.quota.remaining);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
