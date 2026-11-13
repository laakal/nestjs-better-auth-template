import { Global, Inject, Logger, Module } from '@nestjs/common';
import type {
  DynamicModule,
  MiddlewareConsumer,
  NestModule,
  OnModuleInit,
  Provider,
} from '@nestjs/common';
import {
  APP_FILTER,
  DiscoveryModule,
  DiscoveryService,
  HttpAdapterHost,
  MetadataScanner,
} from '@nestjs/core';
import type { BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { toNodeHandler } from 'better-auth/node';
import type { Express, Request, Response } from 'express';

import { APIErrorExceptionFilter } from './api-error-exception-filter.js';
import { AuthGuard } from './auth.guard.js';
import { createAuth, type Auth } from './auth.js';
import { AuthService } from './auth.service.js';
import type { AuthHookContext } from './decorators.js';
import { createSkipBodyParsingMiddleware } from './middlewares.js';
import {
  AFTER_HOOK_KEY,
  AUTH_INSTANCE_KEY,
  AUTH_MODULE_OPTIONS_KEY,
  BEFORE_HOOK_KEY,
  HOOK_KEY,
} from './symbols.js';

/**
 * Configuration options for the AuthModule
 */
export type AuthModuleOptions = {
  /** Do not register the global filter that turns Better Auth `APIError`s into HTTP responses */
  disableExceptionFilter?: boolean;
  /** Do not enable CORS for the `trustedOrigins` of the auth instance */
  disableTrustedOriginsCors?: boolean;
  /** Do not register the JSON / urlencoded body parsers for non-auth routes */
  disableBodyParser?: boolean;
};

type HookMethod = (ctx: AuthHookContext) => unknown;

const HOOKS = [
  { metadataKey: BEFORE_HOOK_KEY, hookType: 'before' as const },
  { metadataKey: AFTER_HOOK_KEY, hookType: 'after' as const },
];

/**
 * NestJS module that integrates Better Auth with NestJS applications.
 * Provides the auth handler, the AuthGuard, hooks, and exception handling.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
})
export class AuthModule implements NestModule, OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  /** The options of the auth instance, widened so optional keys can be read */
  private get authOptions(): BetterAuthOptions {
    return this.auth.options;
  }

  constructor(
    @Inject(AUTH_INSTANCE_KEY) private readonly auth: Auth,
    @Inject(DiscoveryService)
    private readonly discoveryService: DiscoveryService,
    @Inject(MetadataScanner)
    private readonly metadataScanner: MetadataScanner,
    @Inject(HttpAdapterHost)
    private readonly adapter: HttpAdapterHost,
    @Inject(AUTH_MODULE_OPTIONS_KEY)
    private readonly options: AuthModuleOptions,
  ) {}

  onModuleInit() {
    // Setup hooks
    if (!this.authOptions.hooks) return;

    const providers = this.discoveryService
      .getProviders()
      .filter(
        ({ metatype }) => metatype && Reflect.getMetadata(HOOK_KEY, metatype),
      );

    for (const provider of providers) {
      const instance = provider.instance as Record<string, HookMethod>;
      const providerPrototype = Object.getPrototypeOf(instance) as object;
      const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

      for (const method of methods) {
        this.setupHooks(instance[method], instance);
      }
    }
  }

  configure(consumer: MiddlewareConsumer) {
    const trustedOrigins = this.authOptions.trustedOrigins;
    // function-based trustedOrigins requires a Request (from web-apis) object to evaluate, which is not available in NestJS (we only have a express Request object)
    // if we ever need this, take a look at better-call which show an implementation for this
    const isNotFunctionBased = trustedOrigins && Array.isArray(trustedOrigins);

    if (!this.options.disableTrustedOriginsCors && isNotFunctionBased) {
      this.adapter.httpAdapter.enableCors({
        origin: trustedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        credentials: true,
      });
    } else if (
      trustedOrigins &&
      !this.options.disableTrustedOriginsCors &&
      !isNotFunctionBased
    )
      throw new Error(
        'Function-based trustedOrigins not supported in NestJS. Use string array or disable CORS with disableTrustedOriginsCors: true.',
      );

    // Get basePath from options or use default
    let basePath = this.authOptions.basePath ?? '/api/auth';

    // Ensure basePath starts with /
    if (!basePath.startsWith('/')) {
      basePath = `/${basePath}`;
    }

    // Ensure basePath doesn't end with /
    if (basePath.endsWith('/')) {
      basePath = basePath.slice(0, -1);
    }

    if (!this.options.disableBodyParser) {
      consumer
        .apply(createSkipBodyParsingMiddleware(basePath))
        .forRoutes('{*path}');
    }

    const handler = toNodeHandler(this.auth);

    // Mounted directly on the express instance, so the global prefix
    // (app.setGlobalPrefix) does not apply to the auth routes.
    (this.adapter.httpAdapter.getInstance() as Express).use(
      `${basePath}/*splat`,
      (req: Request, res: Response) => {
        req.url = req.originalUrl;
        return handler(req, res);
      },
    );
    this.logger.log(
      `AuthModule initialized BetterAuth on '${basePath}/*splat'`,
    );
  }

  private setupHooks(providerMethod: HookMethod, instance: object) {
    const hooks = this.authOptions.hooks;
    if (!hooks) return;

    for (const { metadataKey, hookType } of HOOKS) {
      const hookPath = Reflect.getMetadata(metadataKey, providerMethod) as
        string | undefined;
      if (!hookPath) continue;

      const originalHook = hooks[hookType];
      hooks[hookType] = createAuthMiddleware(async (ctx) => {
        if (originalHook) {
          await originalHook(ctx);
        }

        if (hookPath === ctx.path) {
          // call with the provider instance so injected dependencies are available
          await providerMethod.call(instance, ctx);
        }
      });
    }
  }

  /**
   * Static factory method to create and configure the AuthModule.
   * The Better Auth instance itself is configured in `auth.ts`.
   * @param options - Configuration options for the module
   */
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    // Called while AppModule is being defined, i.e. after ConfigModule.forRoot()
    // has loaded the .env file.
    const auth = createAuth();

    const providers: Provider[] = [
      {
        provide: AUTH_INSTANCE_KEY,
        useValue: auth,
      },
      {
        provide: AUTH_MODULE_OPTIONS_KEY,
        useValue: options,
      },
      AuthService,
      AuthGuard,
    ];

    if (!options.disableExceptionFilter) {
      providers.push({
        provide: APP_FILTER,
        useClass: APIErrorExceptionFilter,
      });
    }

    return {
      global: true,
      module: AuthModule,
      providers,
      exports: [
        AUTH_INSTANCE_KEY,
        AUTH_MODULE_OPTIONS_KEY,
        AuthService,
        AuthGuard,
      ],
    };
  }
}
