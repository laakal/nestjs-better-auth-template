// Route handlers are only passed around as metadata targets, never called
// oxlint-disable typescript/unbound-method
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APIError } from 'better-auth/api';
import type { Auth } from './auth.js';
import {
  AuthGuard,
  type AuthenticatedRequest,
  type UserSession,
} from './auth.guard.js';
import { Optional, Public } from './decorators.js';

const session = {
  session: { id: 'session-1' },
  user: { id: 'user-1' },
} as UserSession;

class Routes {
  protected() {}

  @Public()
  public() {}

  @Optional()
  optional() {}
}

@Public()
class PublicController {
  anything() {}
}

function setup(
  current: UserSession | null,
  handler: () => void,
  controller: new () => unknown = Routes,
) {
  const getSession = vi.fn().mockResolvedValue(current);
  const guard = new AuthGuard(new Reflector(), {
    api: { getSession },
  } as unknown as Auth);

  const request = {
    headers: { cookie: 'better-auth.session_token=abc' },
  } as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;

  return { guard, context, request, getSession };
}

describe('AuthGuard', () => {
  const routes = new Routes();

  it('allows a request with a session and attaches it to the request', async () => {
    const { guard, context, request, getSession } = setup(
      session,
      routes.protected,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.session).toBe(session);
    expect(request.user).toBe(session.user);

    const { headers } = getSession.mock.calls[0][0] as { headers: Headers };
    expect(headers.get('cookie')).toBe('better-auth.session_token=abc');
  });

  it('rejects a request without a session with a 401 APIError', async () => {
    const { guard, context, request } = setup(null, routes.protected);

    const error: unknown = await guard.canActivate(context).catch((e) => e);

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).statusCode).toBe(401);
    expect(request.user).toBeNull();
  });

  it('allows anonymous requests on @Public() routes', async () => {
    const { guard, context, request } = setup(null, routes.public);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.session).toBeNull();
  });

  it('still attaches the session on @Public() routes', async () => {
    const { guard, context, request } = setup(session, routes.public);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.session).toBe(session);
  });

  it('allows anonymous requests on @Optional() routes', async () => {
    const { guard, context } = setup(null, routes.optional);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('honours @Public() placed on the controller class', async () => {
    const controller = new PublicController();
    const { guard, context } = setup(
      null,
      controller.anything,
      PublicController,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
