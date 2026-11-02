# StyleMe core backend — Implementation Plan

> **For agentic workers:** executed inline (superpowers:executing-plans). Spec: `docs/superpowers/specs/2026-11-02-styleme-core-backend-design.md`.

**Goal:** monorepo + `packages/shared` + Prisma schema + domain + application use cases, fully tested with in-memory fakes.
**Architecture:** Clean Architecture; `application → domain`, domain pure. Ports in domain, fakes in `application/__fakes__`.
**Tech Stack:** pnpm workspaces, TypeScript strict, Vitest, zod, ESLint (flat config), Prisma (validate only).

## Tasks (TDD: test first, then implementation, per unit)

1. **Scaffold** — root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, `.env.example`; `packages/shared`, `apps/api` package manifests. Verify: `pnpm install`.
2. **Shared** — `Result`/`ok`/`err`, enums, `CREDIT_PACKS`, `JOB_BASE_COST`, zod DTOs. Test: `result.test.ts`.
3. **Domain value objects + errors** — `CreditAmount`, `PhoneNumber`, `ImageRef`; error classes. Tests: credit-amount, phone-number.
4. **Domain entities** — `Job`, `Payment`, `User`. Tests: job transitions, billable only when DONE.
5. **Domain ports** — repositories + services interfaces.
6. **Fakes** — in-memory repos, fake providers, UoW, clock, id generator.
7. **Jobs use cases** — `CreateJob`, `RunEnhancementJob`, `ListUserJobs` (tests: invariants 1–4, 6, 7).
8. **Credits/Payments use cases** — `GetCreditBalance`, `InitiatePayment`, `HandlePaymentWebhook` (invariant 5).
9. **Auth use cases** — `RequestOtp`, `VerifyOtp`, `ConfirmAge`.
10. **Prisma schema** — `prisma validate`.
11. **Lint boundaries + `pnpm check`** — prove a forbidden import fails lint; run full check.
