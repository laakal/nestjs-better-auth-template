import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import { AppService } from './app.service.js';
import type { Auth } from './auth/auth.js';
import { UserId } from './auth/user-id.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /*
    Protected route that requires authentication.
    AuthModule registers a global AuthGuard, so no @UseGuards() is needed.
    The session and userId are injected from the request.
  */
  @Get('/cats')
  getCats(
    @Session() session: UserSession<Auth>,
    @UserId() userId: string,
  ): { message: string; userId: string; role: string | null | undefined } {
    return {
      message: this.appService.getCat(),
      userId,
      role: session.user.role, // typed from `additionalFields` in auth.ts
    };
  }

  /*
   Public route that does not require authentication
  */
  @Post('/cats')
  @AllowAnonymous()
  sayHello(
    @Session() session: UserSession<Auth> | null,
    @UserId() userId: string | undefined,
    @Body() body: unknown,
  ): { message: string; authenticated: boolean; body: unknown } {
    return {
      message: this.appService.getCat(),
      authenticated: Boolean(session && userId),
      body,
    };
  }
}
