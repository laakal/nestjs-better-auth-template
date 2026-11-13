import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import type { Auth } from './auth.js';
import { AUTH_INSTANCE_KEY } from './symbols.js';

/**
 * Type representing a valid user session after authentication.
 * Inferred from the auth instance, so `additionalFields` and plugin fields are typed.
 */
export type UserSession = Auth['$Infer']['Session'];

/**
 * Express request after it went through the AuthGuard
 */
export type AuthenticatedRequest = Request & {
  session?: UserSession | null;
  user?: UserSession['user'] | null;
};

/**
 * NestJS guard that handles authentication for protected routes
 * Can be configured with @Public() or @Optional() decorators to modify authentication behavior
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AUTH_INSTANCE_KEY)
    private readonly auth: Auth,
  ) {}

  /**
   * Validates if the current request is authenticated
   * Attaches session and user information to the request object
   * @param context - The execution context of the current request
   * @returns True if the request is authorized to proceed, throws an error otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    request.session = session;
    request.user = session?.user ?? null; // useful for observability tools like Sentry

    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      'PUBLIC',
      targets,
    );

    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(
      'OPTIONAL',
      targets,
    );

    if (isOptional && !session) return true;

    if (!session) {
      throw new APIError(401, {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    }

    return true;
  }
}
