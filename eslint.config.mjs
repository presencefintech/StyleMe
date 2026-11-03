import js from "@eslint/js";
import tseslint from "typescript-eslint";

const forbiddenInCore = [
  { group: ["**/infrastructure/**", "**/presentation/**"], message: "domain/application ne dépendent jamais de infrastructure/presentation (Dependency Rule)." },
  { group: ["@prisma/*", "@nestjs/*", "@supabase/*", "axios", "bullmq", "ioredis"], message: "Pas de lib d'infrastructure dans domain/application." },
];

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.venv/**", "**/next-env.d.ts", "apps/web/public/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/src/domain/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...forbiddenInCore,
        { group: ["**/application/**"], message: "domain ne dépend pas de application." },
      ] }],
    },
  },
  {
    files: ["apps/api/src/application/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: forbiddenInCore }] },
  },
);
