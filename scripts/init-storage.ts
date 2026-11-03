import { createClient } from "@supabase/supabase-js";

/** Crée les buckets PRIVÉS de StyleMe (idempotent). Usage : tsx --env-file=.env scripts/init-storage.ts */
const BUCKETS = ["sources", "results", "selfies-training", "garments"];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  for (const name of BUCKETS) {
    const { error } = await sb.storage.createBucket(name, { public: false });
    if (!error) console.log(`créé   : ${name}`);
    else if (/already exists|duplicate/i.test(error.message)) {
      // Règle non négociable : jamais de bucket public pour des photos de personnes.
      const { error: e2 } = await sb.storage.updateBucket(name, { public: false });
      if (e2) throw new Error(`${name}: ${e2.message}`);
      console.log(`existe : ${name} (forcé en privé)`);
    }
    else throw new Error(`${name}: ${error.message}`);
  }
  const { data } = await sb.storage.listBuckets();
  console.log("buckets:", (data ?? []).map((b) => `${b.name}(${b.public ? "PUBLIC" : "privé"})`).join(", "));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
