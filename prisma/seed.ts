import { PrismaClient, StyleKind } from "@prisma/client";

const prisma = new PrismaClient();

/** Occasions proposées dans l'app (GET /styles). Ids stables : le seed est idempotent (upsert). */
const STYLES: { id: string; name: string; kind: StyleKind; creditCost: number }[] = [
  { id: "mariage", name: "Mariage", kind: "OCCASION", creditCost: 1 },
  { id: "anniversaire", name: "Anniversaire", kind: "OCCASION", creditCost: 1 },
  { id: "bapteme", name: "Baptême", kind: "OCCASION", creditCost: 1 },
  { id: "diplome", name: "Remise de diplôme", kind: "OCCASION", creditCost: 1 },
  { id: "fetes", name: "Fêtes de fin d'année", kind: "OCCASION", creditCost: 1 },
  { id: "saint-valentin", name: "Saint-Valentin", kind: "OCCASION", creditCost: 1 },
  { id: "pro-linkedin", name: "Portrait professionnel", kind: "TEMPLATE", creditCost: 1 },
  { id: "cv", name: "Photo de CV", kind: "TEMPLATE", creditCost: 1 },
  { id: "fond-studio", name: "Fond studio neutre", kind: "TEMPLATE", creditCost: 1 },
];

async function main() {
  for (const s of STYLES) {
    await prisma.styleTemplate.upsert({
      where: { id: s.id },
      create: { ...s, active: true },
      update: { name: s.name, kind: s.kind, creditCost: s.creditCost, active: true },
    });
  }
  console.log(`Seed OK : ${STYLES.length} styles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
