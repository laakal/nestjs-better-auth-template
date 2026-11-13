import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { parseTrustedOrigins } from './auth/auth.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Required: Better Auth needs the raw request body.
    // AuthModule re-adds the JSON/urlencoded parsers for all non-auth routes.
    bodyParser: false,
  });
  app.set('query parser', 'extended');

  app.enableCors({
    origin: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
    credentials: true,
  });

  // Better Auth routes (/api/auth/*) are excluded from the prefix automatically
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
