import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AppService } from './app.service.js';
import { AuthGuard, type UserSession } from './auth/auth.guard.js';
import { Public, Session } from './auth/decorators.js';
import { UserId } from './auth/user-id.decorator.js';

@Controller()
@UseGuards(AuthGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  /*
    Protected route that requires authentication
    The session and userId are automatically injected by the AuthGuard
  */
  @Get('/cats')
  getCats(
    @Session() session: UserSession,
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
  @Public()
  sayHello(
    @Session() session: UserSession | null,
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
