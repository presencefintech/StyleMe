import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { GARMENT_CATEGORIES, type GarmentCategory } from "@styleme/shared";

/**
 * Ajoute une tenue au catalogue de l'essayage virtuel : envoie l'image dans le bucket PRIVÉ "garments" et l'enregistre en base.
 *
 *   tsx --env-file=.env scripts/add-garment.ts <image> --name "Robe pagne" --category DRESSES \
 *       --license "Autorisation écrite de l'atelier X" --author "Atelier X" --description "Knee-length wax print dress" [--draft]
 *
 * --license est OBLIGATOIRE : on ne publie que des visuels dont on a le droit (couturier partenaire, généré par IA,
 * banque d'images sous licence). Pas d'images copiées sur des sites. --draft enregistre la tenue masquée (active=false).
 * La description est en anglais de préférence : le modèle d'essayage la lit.
 */

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function parseArgs(argv: string[]) {
  const [file, ...rest] = argv;
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a?.startsWith("--")) throw new Error(`argument inattendu : ${a}`);
    const next = rest[i + 1];
    if (a === "--draft") opts.draft = true;
    else if (next === undefined || next.startsWith("--")) throw new Error(`${a} attend une valeur`);
    else {
      opts[a.slice(2)] = next;
      i++;
    }
  }
  return { file, opts };
}

async function main() {
  const { file, opts } = parseArgs(process.argv.slice(2));
  const name = opts.name;
  const category = opts.category;
  const license = opts.license;
  if (!file || typeof name !== "string" || typeof category !== "string" || typeof license !== "string") {
    throw new Error('usage : add-garment.ts <image> --name "..." --category DRESSES|UPPER_BODY|LOWER_BODY --license "..." [--author "..."] [--description "..."] [--draft]');
  }
  if (!GARMENT_CATEGORIES.includes(category as GarmentCategory)) throw new Error(`catégorie invalide (${GARMENT_CATEGORIES.join(", ")})`);
  if (license.trim().length < 3) throw new Error("--license est obligatoire : d'où vient cette image et a-t-on le droit de l'utiliser ?");
  const ext = extname(file).toLowerCase();
  const contentType = MIME[ext];
  if (!contentType) throw new Error("formats acceptés : png, jpg, webp");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const id = randomUUID();
  const objectKey = `${id}${ext}`;
  const { error } = await sb.storage.from("garments").upload(objectKey, readFileSync(file), { contentType, upsert: false });
  if (error) throw new Error(`envoi vers le bucket "garments" : ${error.message} (bucket créé ? lancer scripts/init-storage.ts)`);

  const prisma = new PrismaClient();
  try {
    await prisma.garment.create({
      data: {
        id,
        name,
        category: category as GarmentCategory,
        description: typeof opts.description === "string" ? opts.description : null,
        bucket: "garments",
        key: objectKey,
        author: typeof opts.author === "string" ? opts.author : null,
        license,
        active: opts.draft !== true,
      },
    });
  } catch (e) {
    await sb.storage.from("garments").remove([objectKey]); // pas de fichier orphelin si la base refuse
    throw e;
  } finally {
    await prisma.$disconnect();
  }
  console.log(`${opts.draft === true ? "brouillon" : "publiée"} : ${name} (${category}) → garments/${objectKey}  [id ${id}]`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
