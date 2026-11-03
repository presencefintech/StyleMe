import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import type { GarmentCategory } from "@styleme/shared";

/**
 * Catalogue de départ de l'essayage virtuel : 10 tenues générées par IA (FLUX.1 schnell, licence Apache-2.0,
 * usage commercial permis). Idempotent : relancer met à jour les lignes, ne les duplique pas.
 *
 *   tsx --env-file=.env scripts/seed-garments.ts <dossier-des-images-recadrées>
 *
 * Le dossier contient <slug>.png (768x1024, fond blanc). Les images sont envoyées dans le bucket PRIVÉ "garments".
 * Ce sont des visuels de DÉMARRAGE : à remplacer au fil de l'eau par des tenues réelles de couturiers partenaires
 * (voir scripts/add-garment.ts), et à retirer du catalogue avec active=false.
 */
const LICENSE = "Image générée par IA (FLUX.1 schnell, Apache-2.0), usage commercial permis";
const AUTHOR = "StyleMe (généré par IA)";

interface Seed { slug: string; name: string; category: GarmentCategory; description: string }
const SEEDS: Seed[] = [
  { slug: "robe-pagne-courte", name: "Robe pagne géométrique", category: "DRESSES", description: "Knee-length African wax print Ankara dress with bold geometric pattern" },
  { slug: "robe-pagne-longue", name: "Robe longue pagne fleuri", category: "DRESSES", description: "Long floor-length African wax print dress with large floral pattern in yellow, green and blue" },
  { slug: "robe-soiree-rouge", name: "Robe de soirée rouge", category: "DRESSES", description: "Long red satin evening gown with thin straps" },
  { slug: "robe-cocktail-noire", name: "Robe cocktail noire", category: "DRESSES", description: "Knee-length black cocktail dress with thin straps" },
  { slug: "robe-ete-fleurie", name: "Robe d'été fleurie", category: "DRESSES", description: "Light summer midi dress with small floral print on white fabric" },
  { slug: "chemise-pagne-homme", name: "Chemise pagne homme", category: "UPPER_BODY", description: "Short-sleeve button-up shirt in African wax print with red and navy geometric pattern" },
  { slug: "chemise-blanche", name: "Chemise blanche", category: "UPPER_BODY", description: "Plain white long-sleeve cotton button-up shirt" },
  { slug: "blouse-brodee", name: "Blouse brodée", category: "UPPER_BODY", description: "Cream blouse with embroidery on the neckline and three-quarter sleeves" },
  { slug: "jupe-pagne-longue", name: "Jupe longue pagne", category: "LOWER_BODY", description: "Long A-line skirt in African wax print with orange and teal pattern" },
  { slug: "pantalon-tailleur-noir", name: "Pantalon noir", category: "LOWER_BODY", description: "Black tailored straight-leg dress trousers" },
];

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage : seed-garments.ts <dossier-des-images>");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const prisma = new PrismaClient();
  try {
    for (const s of SEEDS) {
      const objectKey = `seed/${s.slug}.png`;
      const { error } = await sb.storage.from("garments").upload(objectKey, readFileSync(join(dir, `${s.slug}.png`)), { contentType: "image/png", upsert: true });
      if (error) throw new Error(`${s.slug} : ${error.message}`);
      const data = { name: s.name, category: s.category, description: s.description, bucket: "garments", key: objectKey, author: AUTHOR, license: LICENSE, active: true };
      await prisma.garment.upsert({ where: { id: s.slug }, create: { id: s.slug, ...data }, update: data });
      console.log(`ok : ${s.name} (${s.category})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
