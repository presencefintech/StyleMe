import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  type RawBodyRequest,
  BadRequestException,
  type Provider,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  CREDIT_PACKS,
  ConfirmAgeDto,
  DeleteAccountDto,
  CreateJobDto,
  InitiatePaymentDto,
  CommitSelectionDto,
  PresignDto,
  SegmentDto,
  LoginDto,
  RegisterDto,
} from "@styleme/shared";
import {
  ConfirmAge,
  DeleteAccount,
  CreateJob,
  GetCreditBalance,
  GetReferralInfo,
  GetJob,
  GetPayment,
  HandlePaymentWebhook,
  InitiatePayment,
  ListGarments,
  ListStyles,
  ListUserJobs,
  CommitSelection,
  GetJobResultAsset,
  PrepareObject,
  PresignAsset,
  SegmentObject,
  Login,
  Register,
} from "../../application";
import { AuthUser, CurrentUser, IdempotencyInterceptor, JwtGuard, T, jobView, parseBody, unwrap } from "./common";

/** Câble un use case : classe + liste de tokens de ports dans l'ordre du constructeur. */
type Ctor = new (...args: never[]) => unknown;
const useCase = (cls: Ctor, deps: string[]): Provider => ({
  provide: cls,
  useFactory: (...args: unknown[]) => new (cls as new (...a: unknown[]) => unknown)(...args),
  inject: deps,
});

// --- Auth ---------------------------------------------------------------------

const userView = (u: { id: string; email: { value: string }; isAgeConfirmed: boolean }) => ({ id: u.id, email: u.email.value, ageConfirmed: u.isAgeConfirmed });

@Controller("auth")
class AuthController {
  constructor(
    @Inject(Register) private readonly register: Register,
    @Inject(Login) private readonly login: Login,
    @Inject(ConfirmAge) private readonly confirmAge: ConfirmAge,
    @Inject(DeleteAccount) private readonly deleteAccount: DeleteAccount,
  ) {}

  /** Droit à l'effacement : supprime les photos et anonymise le compte. Le mot de passe est redemandé. */
  @Post("delete-account")
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async remove(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    unwrap(await this.deleteAccount.execute({ userId: user.id, password: parseBody(DeleteAccountDto, body).password }));
  }

  @Post("register")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async signUp(@Body() body: unknown) {
    const { accessToken, user } = unwrap(await this.register.execute(parseBody(RegisterDto, body)));
    return { accessToken, user: userView(user) };
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async signIn(@Body() body: unknown) {
    const { accessToken, user } = unwrap(await this.login.execute(parseBody(LoginDto, body)));
    return { accessToken, user: userView(user) };
  }

  @Post("confirm-age")
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async confirm(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    parseBody(ConfirmAgeDto, body);
    unwrap(await this.confirmAge.execute({ userId: user.id }));
  }
}

@Module({
  controllers: [AuthController],
  providers: [
    JwtGuard,
    useCase(Register, [T.USERS, T.PASSWORD, T.TOKEN_ISSUER, T.IDS, T.LEDGER]),
    useCase(Login, [T.USERS, T.PASSWORD, T.TOKEN_ISSUER]),
    useCase(ConfirmAge, [T.USERS, T.CLOCK]),
    useCase(DeleteAccount, [T.USERS, T.PASSWORD, T.STORAGE, T.ACCOUNT_DATA, T.CLOCK]),
  ],
})
export class AuthModule {}

// --- Assets & styles ------------------------------------------------------------

@Controller()
class AssetsController {
  constructor(
    @Inject(PresignAsset) private readonly presign: PresignAsset,
    @Inject(ListStyles) private readonly listStyles: ListStyles,
    @Inject(ListGarments) private readonly listGarments: ListGarments,
    @Inject(SegmentObject) private readonly segmentObject: SegmentObject,
    @Inject(PrepareObject) private readonly prepareObject: PrepareObject,
    @Inject(CommitSelection) private readonly commitSelection: CommitSelection,
  ) {}

  @Post("assets/presign")
  @HttpCode(201)
  @UseGuards(JwtGuard)
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return unwrap(await this.presign.execute({ userId: user.id, kind: parseBody(PresignDto, body).kind }));
  }

  /** Gomme magique : préchauffe l'analyse d'une photo juste après son envoi (le 1er clic devient rapide). */
  @Post("assets/:id/prepare")
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async prepare(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    unwrap(await this.prepareObject.execute({ userId: user.id, assetId: id }));
  }

  /** Gomme magique, étape 1 : trouve l'objet sous le clic (x, y normalisés 0..1) et renvoie un aperçu à confirmer. */
  @Post("assets/:id/segment")
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @Throttle({ default: { limit: 1200, ttl: 60_000 } }) // appelé aussi au survol de la souris
  async segment(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const target = parseBody(SegmentDto, body); // { x, y } (clic) ou { box } (rectangle)
    return unwrap(await this.segmentObject.execute({ userId: user.id, assetId: id, ...target }));
  }

  /** Gomme magique, étape 2 : confirme la sélection (envoie la photo normalisée et le masque au stockage). */
  @Post("assets/:id/selection")
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async commit(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { selectionId } = parseBody(CommitSelectionDto, body);
    return unwrap(await this.commitSelection.execute({ userId: user.id, assetId: id, selectionId }));
  }

  @Get("styles")
  @UseGuards(JwtGuard)
  async styles() {
    return unwrap(await this.listStyles.execute());
  }

  /** Catalogue des tenues pour l'essayage virtuel (miniatures signées). */
  @Get("garments")
  @UseGuards(JwtGuard)
  async garments() {
    return unwrap(await this.listGarments.execute());
  }
}

@Module({
  controllers: [AssetsController],
  providers: [JwtGuard, useCase(PresignAsset, [T.ASSETS, T.STORAGE, T.IDS, T.CLOCK]), useCase(ListStyles, [T.STYLES]), useCase(ListGarments, [T.GARMENTS, T.STORAGE]), useCase(SegmentObject, [T.USERS, T.ASSETS, T.SELECTOR]), useCase(PrepareObject, [T.USERS, T.ASSETS, T.SELECTOR]), useCase(CommitSelection, [T.USERS, T.ASSETS, T.SELECTOR, T.IDS])],
})
export class AssetsModule {}

// --- Jobs ----------------------------------------------------------------------------

@Controller("jobs")
@UseGuards(JwtGuard)
class JobsController {
  constructor(
    @Inject(CreateJob) private readonly createJob: CreateJob,
    @Inject(GetJob) private readonly getJob: GetJob,
    @Inject(ListUserJobs) private readonly listJobs: ListUserJobs,
    @Inject(GetJobResultAsset) private readonly resultAsset: GetJobResultAsset,
  ) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(IdempotencyInterceptor)
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const dto = parseBody(CreateJobDto, body);
    const job = unwrap(await this.createJob.execute({ userId: user.id, ...dto }));
    return { jobId: job.id, status: job.status };
  }

  /** Fait du résultat d'un job une photo réutilisable comme source (ex. gommer un autre objet dessus). */
  @Post(":id/asset")
  @HttpCode(200)
  async asResultAsset(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return unwrap(await this.resultAsset.execute({ userId: user.id, jobId: id }));
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { job, outputUrls, sourceUrl } = unwrap(await this.getJob.execute({ userId: user.id, jobId: id }));
    return jobView(job, outputUrls, sourceUrl);
  }

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    const n = limit === undefined ? undefined : Number(limit);
    if (n !== undefined && !Number.isInteger(n)) throw new BadRequestException("limit must be an integer");
    const page = unwrap(await this.listJobs.execute({ userId: user.id, cursor, limit: n }));
    return { items: page.items.map((j) => jobView(j)), nextCursor: page.nextCursor };
  }
}

@Module({
  controllers: [JobsController],
  providers: [
    JwtGuard,
    IdempotencyInterceptor,
    useCase(CreateJob, [T.USERS, T.JOBS, T.LEDGER, T.ASSETS, T.QUEUE, T.IDS, T.GARMENTS]),
    useCase(GetJob, [T.JOBS, T.STORAGE, T.ASSETS]),
    useCase(ListUserJobs, [T.JOBS]),
    useCase(GetJobResultAsset, [T.JOBS, T.ASSETS, T.STORAGE, T.IDS]),
  ],
})
export class JobsModule {}

// --- Credits -----------------------------------------------------------------------------

@Controller("credits")
@UseGuards(JwtGuard)
class CreditsController {
  constructor(
    @Inject(GetCreditBalance) private readonly balance: GetCreditBalance,
    @Inject(GetReferralInfo) private readonly referral: GetReferralInfo,
  ) {}

  @Get("balance")
  async getBalance(@CurrentUser() user: AuthUser) {
    return { balance: unwrap(await this.balance.execute(user.id)) };
  }

  @Get("referral")
  async getReferral(@CurrentUser() user: AuthUser) {
    return unwrap(await this.referral.execute(user.id));
  }

  @Get("packs")
  packs() {
    return CREDIT_PACKS;
  }
}

@Module({ controllers: [CreditsController], providers: [JwtGuard, useCase(GetCreditBalance, [T.LEDGER]), useCase(GetReferralInfo, [T.USERS])] })
export class CreditsModule {}

// --- Payments ---------------------------------------------------------------------------

@Controller("payments")
class PaymentsController {
  constructor(
    @Inject(InitiatePayment) private readonly initiate: InitiatePayment,
    @Inject(GetPayment) private readonly getPayment: GetPayment,
    @Inject(HandlePaymentWebhook) private readonly webhook: HandlePaymentWebhook,
  ) {}

  @Post("initiate")
  @HttpCode(201)
  @UseGuards(JwtGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async start(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const p = unwrap(await this.initiate.execute({ userId: user.id, ...parseBody(InitiatePaymentDto, body) }));
    return { paymentId: p.id, status: p.status };
  }

  @Get(":id")
  @UseGuards(JwtGuard)
  async get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const p = unwrap(await this.getPayment.execute({ userId: user.id, paymentId: id }));
    return { id: p.id, status: p.status };
  }

  /** Appelé par l'agrégateur : non authentifié JWT, authentifié par signature HMAC du corps brut. */
  @Post("webhook")
  @HttpCode(200)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async hook(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody?.toString("utf8");
    const signature = req.header("x-signature");
    if (!raw || !signature) throw new BadRequestException("missing body or signature");
    try {
      unwrap(await this.webhook.execute({ payload: raw, signature }));
    } catch (e) {
      if (e instanceof SyntaxError) throw new BadRequestException("invalid JSON");
      throw e;
    }
  }
}

@Module({
  controllers: [PaymentsController],
  providers: [
    JwtGuard,
    IdempotencyInterceptor,
    useCase(InitiatePayment, [T.PAYMENTS, T.GATEWAY, T.IDS]),
    useCase(GetPayment, [T.PAYMENTS]),
    useCase(HandlePaymentWebhook, [T.PAYMENTS, T.LEDGER, T.GATEWAY, T.UOW]),
  ],
})
export class PaymentsModule {}
