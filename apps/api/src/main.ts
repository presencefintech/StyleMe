import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { loadEnv } from "./infrastructure/config/env";
import { flushSentry, initSentry, reportError } from "./infrastructure/observability/sentry";
import { AppModule, configureApp } from "./presentation/http/app.module";
import { setUnexpectedErrorReporter } from "./presentation/http/common";

async function bootstrap() {
  const env = loadEnv(); // fail-fast
  if (initSentry(env.SENTRY_DSN, process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? "development")) {
    setUnexpectedErrorReporter((e) => reportError(e));
  }
  // rawBody : indispensable pour vérifier la signature HMAC du webhook de paiement.
  const app = await NestFactory.create(AppModule.register(InfrastructureModule.register(env)), { rawBody: true });
  configureApp(app);
  app.enableCors({ origin: env.CORS_ORIGIN.split(","), credentials: false });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`API on :${env.PORT}/api/v1`);
}

bootstrap().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  reportError(e, { phase: "bootstrap" });
  await flushSentry();
  process.exit(1);
});

// Une promesse rejetée non gérée ne doit pas passer inaperçue.
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
  reportError(reason, { phase: "unhandledRejection" });
});
