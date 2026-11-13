import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    // Must stay before AuthModule: it loads .env, which auth.ts reads
    ConfigModule.forRoot({
      envFilePath: `.env`,
      isGlobal: true,
    }),
    AuthModule.forRoot({
      // CORS is configured once for the whole app in main.ts
      disableTrustedOriginsCors: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
