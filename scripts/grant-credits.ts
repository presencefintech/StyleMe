import { PrismaClient } from "@prisma/client";

/**
 * Ajoute des crédits de TEST à un compte (écriture append-only dans le ledger).
 * Usage : tsx --env-file=.env scripts/grant-credits.ts <email> <montant>
 */
const prisma = new PrismaClient();

async function main() {
  const [emailArg, amountArg] = process.argv.slice(2);
  const amount = Number(amountArg);
  if (!emailArg || !Number.isInteger(amount) || amount <= 0) throw new Error("Usage: grant-credits.ts <email> <montant entier > 0>");
  const user = await prisma.user.findUnique({ where: { email: emailArg.trim().toLowerCase() } });
  if (!user) throw new Error(`Aucun compte pour ${emailArg}`);
  await prisma.creditTransaction.create({ data: { userId: user.id, amount, reason: "grant:test-credits" } });
  const sum = await prisma.creditTransaction.aggregate({ where: { userId: user.id }, _sum: { amount: true } });
  console.log(`+${amount} crédits pour ${user.email} → solde ${sum._sum.amount}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
