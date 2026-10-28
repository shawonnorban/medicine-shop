// Loads the starter generic library. Safe to run repeatedly: matches by name, and only fills fields that are still empty,
// so text your team has edited is never overwritten.
import { sql } from './client.js';
import { GENERICS } from './generic-library-data.js';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let created = 0, filled = 0;
for (const g of GENERICS) {
  const [hit] = await sql`SELECT id FROM generics WHERE lower(name) = lower(${g.name})`;
  if (!hit) {
    await sql`INSERT INTO generics (name, slug, drug_class, indications, dosage_info, side_effects, contraindications, interactions, pregnancy_note, storage_info)
              VALUES (${g.name}, ${slugify(g.name)}, ${g.drugClass}, ${g.indications}, ${g.dosage}, ${g.sideEffects}, ${g.contraindications}, ${g.interactions}, ${g.pregnancy}, ${g.storage ?? null})
              ON CONFLICT (slug) DO NOTHING`;
    created++;
  } else {
    await sql`UPDATE generics SET drug_class = COALESCE(drug_class, ${g.drugClass}), indications = COALESCE(indications, ${g.indications}), dosage_info = COALESCE(dosage_info, ${g.dosage}),
              side_effects = COALESCE(side_effects, ${g.sideEffects}), contraindications = COALESCE(contraindications, ${g.contraindications}), interactions = COALESCE(interactions, ${g.interactions}),
              pregnancy_note = COALESCE(pregnancy_note, ${g.pregnancy}), storage_info = COALESCE(storage_info, ${g.storage ?? null}) WHERE id = ${hit.id}`;
    filled++;
  }
}
console.log(`generic library: ${created} added, ${filled} existing filled`);
await sql.end();
