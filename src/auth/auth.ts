import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { MongoClient } from 'mongodb';

/**
 * Builds the Better Auth instance.
 *
 * It is a factory (instead of a top-level `export const auth`) so that the
 * environment is read after `ConfigModule` has loaded the `.env` file.
 * See `AuthModule.forRootAsync` in `app.module.ts`.
 */
export function createAuth(env: NodeJS.ProcessEnv = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const client = new MongoClient(env.MONGODB_URI as string);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: parseTrustedOrigins(env.TRUSTED_ORIGINS),
    // Works with a standalone MongoDB. On a replica set (e.g. Atlas) you can
    // pass `{ client }` as a second argument to enable database transactions.
    database: mongodbAdapter(client.db()),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      freshAge: 10,
      modelName: 'sessions',
    },
    user: {
      modelName: 'users',
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'user',
          input: false, // users must not be able to set their own role on sign-up
        },
      },
    },
    account: {
      modelName: 'accounts',
    },
    verification: {
      modelName: 'verifications',
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID as string,
        clientSecret: env.GITHUB_CLIENT_SECRET as string,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID as string,
        clientSecret: env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    // Required by @thallesp/nestjs-better-auth to register @Hook() providers
    hooks: {},
    // cross domain cookies
    ...(isProd
      ? {
          advanced: {
            crossSubDomainCookies: {
              enabled: true,
              domain: env.CROSS_DOMAIN_ORIGIN, // Domain with a leading period
            },
            defaultCookieAttributes: {
              secure: true,
              httpOnly: true,
              sameSite: 'none', // Allows CORS-based cookie sharing across subdomains
              partitioned: true, // New browser standards will mandate this for foreign cookies
            },
          },
        }
      : {}),
  });
}

export function parseTrustedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export type Auth = ReturnType<typeof createAuth>;
