import { PrismaClient } from "@prisma/client";

// Lecture seule : liste les tables du schéma public.
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
  console.log(`TABLES_IN_PUBLIC=${rows.length}`, rows.map((r) => r.table_name).join(","));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
