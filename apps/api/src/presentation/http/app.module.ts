import { DynamicModule, Module, type INestApplication, type Type } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AllExceptionsFilter } from "./common";
import { AssetsModule, AuthModule, CreditsModule, JobsModule, PaymentsModule } from "./features.module";

export const API_PREFIX = "api/v1";

/**
 * `ports` = module global qui fournit les ports (tokens de `T`) :
 * InfrastructureModule en prod, InMemoryPortsModule en test. Seul endroit qui choisit les implémentations.
 */
@Module({})
export class AppModule {
  static register(ports: Type<unknown> | DynamicModule): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ports,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
        AuthModule,
        AssetsModule,
        JobsModule,
        CreditsModule,
        PaymentsModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    };
  }
}

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix(API_PREFIX);
}
