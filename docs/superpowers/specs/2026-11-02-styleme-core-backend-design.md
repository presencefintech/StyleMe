# StyleMe — Sous-projet 1 : socle + cœur backend (design)

Date : 2026-11-02 · Source : `STYLEME_ARCHITECTURE.md` (collé par l'utilisateur) · Client = **web Next.js** (pas React Native).

## 1. Décomposition globale

| # | Sous-projet | Statut |
|---|---|---|
| 1 | Socle + cœur backend (domain, application, tests) | **ce document** |
| 2 | Adapters infra (Prisma, Supabase Storage, BullMQ, IA, Flexpay) + controllers NestJS | à venir |
| 3 | App web Next.js (App Router, Tailwind, TanStack Query) | à venir |

Chaque sous-projet a son propre cycle spec → plan → implémentation.

## 2. Périmètre du sous-projet 1

**Inclus** : monorepo pnpm, TypeScript strict, Vitest ; `packages/shared` ; `prisma/schema.prisma` ; couches `domain/` et `application/` de l'API ; fakes in-memory ; tests des invariants ; règle lint de dépendances.
**Exclu** : adapters concrets, controllers/modules NestJS, workers, app web, `LoraModel` (v2).

> `STYLEME_SPEC.md` n'a pas été fourni : le schéma Prisma est reconstruit depuis l'architecture. À réconcilier si ce fichier apparaît.

## 3. Structure

```
styleme/
├── package.json · pnpm-workspace.yaml · tsconfig.base.json · eslint.config.mjs · .env.example
├── packages/shared/src/        # result.ts, enums.ts, dto/*.ts (zod), index.ts
├── prisma/schema.prisma
└── apps/api/src/
    ├── domain/{entities,value-objects,ports,errors}/
    ├── application/
    │   ├── use-cases/{jobs,credits,payments,auth}/
    │   └── __fakes__/
    └── (infrastructure/, presentation/ : sous-projet 2)
```

`apps/api` est un package TypeScript pur pour l'instant (pas de dépendance NestJS). `apps/web` sera créé au sous-projet 3.

## 4. Règle de dépendance

`application → domain`, `domain → rien`. Les deux couches ne dépendent que de `packages/shared` (`Result`). Appliqué par `eslint-plugin-boundaries` : tout import de `infrastructure/`, `presentation/`, `@prisma/*`, `@nestjs/*`, `axios`, `@supabase/*` depuis `domain/` ou `application/` fait échouer le lint.

## 5. Domain

- **Value objects** : `CreditAmount` (entier, immuable, `of/add/subtract/isGreaterOrEqual`), `PhoneNumber` (format E.164 validé), `ImageRef {bucket,key}`.
- **Entities** : `Job` (statuts `PENDING→PROCESSING→DONE|REJECTED|FAILED`, transitions gardées, `isBillable()` vrai seulement si `DONE`), `Payment` (`PENDING→SUCCEEDED|FAILED`, `providerRef`), `User` (id, phone, `ageConfirmedAt`).
- **Ports** : `JobRepository`, `CreditLedgerRepository` (`balanceOf`, `append`), `PaymentRepository` (dont `findByProviderRef`), `UserRepository`, `ImageEnhancer`, `BackgroundService`, `ModerationService`, `StorageService`, `PaymentGateway`, `OtpService` (envoi/vérification), `TokenService` (émission JWT), `JobQueue` (enqueue), `UnitOfWork`, `IdGenerator`, `Clock`.
- **Erreurs** : `DomainError` ; `InsufficientCredits`, `ModerationRejected`, `JobNotFound`, `InvalidJobTransition`, `PaymentNotFound`, `InvalidPaymentSignature`, `InvalidOtp`, `AgeNotConfirmed`.

Écart assumé vs le document : `ModerationRejected` reste une erreur typée mais `RunEnhancementJob` signale un rejet par l'état du job (`REJECTED`) et retourne `ok`, comme dans §4.

## 6. Application (un use case = une classe, `execute()` → `Result`)

| Use case | Comportement clé |
|---|---|
| `CreateJob` | vérifie le solde ≥ coût (sinon `err(InsufficientCredits)`, aucun job créé), crée `Job` PENDING, enqueue. Le coût vient du type/style. |
| `RunEnhancementJob` | pipeline §4 : modération entrée → upscale → restoreFace → remove bg → modération sortie → `UnitOfWork` {`markDone`, save, débit}. Échec provider : `markFailed`, 0 débit. Rejet : `REJECTED`, 0 débit. |
| `GetCreditBalance` | `ledger.balanceOf`. |
| `ListUserJobs` | `jobs.listByUser`, tri récent d'abord. |
| `InitiatePayment` | résout le pack, appelle `PaymentGateway.initiate`, persiste `Payment` PENDING. |
| `HandlePaymentWebhook` | vérifie la signature (sinon `err(InvalidPaymentSignature)`), retrouve par `providerRef`, **idempotent** : déjà `SUCCEEDED` → `ok` sans re-créditer ; sinon `UnitOfWork` {marque payé + `ledger.append(+crédits)`}. |
| `RequestOtp` / `VerifyOtp` | OTP via port ; `VerifyOtp` crée l'utilisateur si absent et émet le JWT. |
| `ConfirmAge` | pose `ageConfirmedAt` (age gate +18). `CreateJob` refuse si non confirmé (`AgeNotConfirmed`). |

Les packs de crédits sont une table statique dans `packages/shared` (id, crédits, prix, devise) tant qu'aucune spec ne les fixe.

## 7. Prisma (`schema.prisma`)

Modèles : `User`, `Asset`, `Job`, `StyleTemplate`, `CreditTransaction` (append-only, solde = `SUM(amount)`), `Payment` (`providerRef` unique → garde d'idempotence au niveau DB), `ModerationLog` (un enregistrement par décision). Enums alignés sur `packages/shared`. Aucune migration appliquée dans ce sous-projet (pas de DB) ; on valide avec `prisma validate`.

## 8. Tests (Vitest, sans infra)

Fakes dans `application/__fakes__/` : `InMemoryJobRepository`, `InMemoryCreditLedger`, `InMemoryPaymentRepository`, `InMemoryUserRepository`, `FakeModeration`, `FakeEnhancer`, `FakeBackground`, `FakePaymentGateway`, `FakeOtpService`, `InMemoryUnitOfWork`, `FixedClock`, `SequentialIdGenerator`.

Invariants testés (§13 + règles produit) :
1. modération entrée rejetée (ou risque mineur) → `REJECTED`, 0 crédit débité ;
2. modération sortie rejetée → `REJECTED`, 0 débit, aucune sortie livrée ;
3. échec provider → `FAILED`, 0 débit ;
4. succès → `DONE` et exactement un débit, atomique avec la livraison ;
5. webhook rejoué → crédité une seule fois ; signature invalide → refus, rien crédité ;
6. solde insuffisant → `InsufficientCredits`, aucun job créé ;
7. non-confirmation d'âge → `AgeNotConfirmed` ;
8. transitions d'état de `Job` invalides → `InvalidJobTransition` ;
9. `CreditAmount` refuse les non-entiers.

Plus un test d'architecture : le lint de frontières est exécuté dans le script `pnpm check` (`tsc --noEmit` + eslint + vitest).

## 9. Conventions

TypeScript `strict`, pas de `any` injustifié, noms : use cases en verbe, ports en rôle. Un fichier = un export principal, barrels par couche. Conventional Commits. Config d'env typée (zod) seulement au sous-projet 2.

## 10. Critères de réussite

`pnpm install && pnpm check` passe : types, lint de frontières, tous les tests ci-dessus verts ; `pnpm prisma validate` OK.
