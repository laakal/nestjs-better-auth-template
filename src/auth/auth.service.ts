import { Inject, Injectable } from '@nestjs/common';
import type { Auth } from './auth.js';
import { AUTH_INSTANCE_KEY } from './symbols.js';

/**
 * NestJS service that provides access to the Better Auth instance
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_INSTANCE_KEY)
    private readonly auth: Auth,
  ) {}

  /**
   * Returns the API endpoints provided by the auth instance
   */
  get api(): Auth['api'] {
    return this.auth.api;
  }

  /**
   * Returns the complete auth instance
   * Access this for plugin-specific functionality
   */
  get instance(): Auth {
    return this.auth;
  }
}
