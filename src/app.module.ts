import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { createAuth } from './auth/auth.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env`,
      isGlobal: true,
    }),
    // Registers the Better Auth handler on /api/auth/* and a global AuthGuard:
    // every route requires a session unless marked with @AllowAnonymous()
    // or @OptionalAuth().
    AuthModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        auth: createAuth(),
        // CORS is configured once for the whole app in main.ts
        disableTrustedOriginsCors: true,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
