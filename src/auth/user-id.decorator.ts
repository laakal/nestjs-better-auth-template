import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';

/**
 * Parameter decorator that returns the id of the authenticated user,
 * or `undefined` on routes that allow anonymous access.
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { session?: UserSession | null }>();
    return request.session?.user.id;
  },
);
