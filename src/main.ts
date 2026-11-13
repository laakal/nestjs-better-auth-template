import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { parseTrustedOrigins } from './auth/auth.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Required: Better Auth needs the raw request body.
    // AuthModule adds the JSON/urlencoded parsers back for all non-auth routes.
    bodyParser: false,
  });
  app.set('query parser', 'extended');

  app.enableCors({
    origin: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
    credentials: true,
  });

  // Better Auth is mounted on /api/auth/* by AuthModule, outside the global prefix
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
