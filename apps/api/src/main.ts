import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";
import { loadEnv } from "./infrastructure/config/env";
import { AppModule, configureApp } from "./presentation/http/app.module";

async function bootstrap() {
  const env = loadEnv(); // fail-fast
  // rawBody : indispensable pour vérifier la signature HMAC du webhook de paiement.
  const app = await NestFactory.create(AppModule.register(InfrastructureModule.register(env)), { rawBody: true });
  configureApp(app);
  app.enableCors({ origin: env.CORS_ORIGIN.split(","), credentials: false });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`API on :${env.PORT}/api/v1`);
}

bootstrap().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
