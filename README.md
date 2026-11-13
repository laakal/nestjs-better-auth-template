# NestJS with Better Auth Example

This project demonstrates how to integrate [Better Auth](https://better-auth.dev/) into a NestJS application for streamlined and flexible authentication.

The NestJS integration is provided by [`@thallesp/nestjs-better-auth`](https://github.com/ThallesP/nestjs-better-auth).

**Special thanks to [ThallesP](https://github.com/ThallesP) for their work on it!**

---

## 📑 Table of Contents

- [NestJS with Better Auth Example](#nestjs-with-better-auth-example)
  - [📑 Table of Contents](#-table-of-contents)
  - [🧰 Project Information](#-project-information)
  - [✅ Prerequisites](#-prerequisites)
  - [⚙️ Project Setup](#️-project-setup)
  - [🚀 Running the Application](#-running-the-application)
  - [🔐 Authentication Configuration](#-authentication-configuration)
  - [🗄️ Database Migrations](#️-database-migrations)
  - [🌐 Cross-Domain Session Configuration](#-cross-domain-session-configuration)
  - [🛡️ Protecting Routes](#️-protecting-routes)
  - [🌐 Global API Prefix](#-global-api-prefix)
  - [🧩 Frontend Integration (Next.js)](#-frontend-integration-nextjs)
  - [🔁 Redirect After Sign-in](#-redirect-after-sign-in)
  - [🔒 Session Handling in Next.js](#-session-handling-in-nextjs)
    - [Middleware (`middleware.ts`)](#middleware-middlewarets)
    - [Server-side Rendering (`page.tsx`)](#server-side-rendering-pagetsx)
    - [Client Component Example](#client-component-example)
  - [🧪 Tips](#-tips)

---

## 🧰 Project Information

- **Framework:** NestJS v12 (ESM, TypeScript 6)
- **Auth:** Better Auth v1.7 (also verified against v1.8 beta) via `@thallesp/nestjs-better-auth` v2
- **HTTP Framework:** Express v5 (integrated in NestJS)
- **Database Adapter:** MongoDB
- **Tests:** Vitest
- **Linting:** oxlint (type-aware), formatting with Prettier

> The project is an ES module (`"type": "module"`), which is the NestJS 12 default. Relative imports need a `.js` extension, e.g. `import { AppModule } from './app.module.js'`.

---

## ✅ Prerequisites

Ensure the following are installed:

- **Node.js** v26 LTS or newer (see `.nvmrc`)
- **npm** (comes with Node.js)
- **MongoDB** (running instance required)

---

## ⚙️ Project Setup

1. **Clone the repository**

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create and configure the `.env` file**

   Create a `.env` file in the project root with:

   ```env
   MONGODB_URI="YOUR_MONGODB_CONNECTION_STRING"
   BETTER_AUTH_SECRET="A_RANDOM_SECRET" # openssl rand -base64 32
   BETTER_AUTH_URL="http://localhost:3000" # public URL of this API
   GITHUB_CLIENT_ID="YOUR_GITHUB_APPLICATION_CLIENT_ID"
   GITHUB_CLIENT_SECRET="YOUR_GITHUB_APPLICATION_CLIENT_SECRET"
   GOOGLE_CLIENT_ID="YOUR_GOOGLE_APPLICATION_CLIENT_ID"
   GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_APPLICATION_CLIENT_SECRET"
   TRUSTED_ORIGINS="http://localhost:3001"
   ```

   > Replace placeholders with your actual credentials and frontend origin.

---

## 🚀 Running the Application

- **Development Mode**

  ```bash
  npm run start:dev
  ```

- **Production Mode**

  ```bash
  npm run build
  npm run start:prod
  ```

- **Tests**

  ```bash
  npm test          # unit tests
  npm run test:e2e  # e2e tests
  ```

---

## 🔐 Authentication Configuration

The core Better Auth config is in `src/auth/auth.ts`:

```ts
export function createAuth(env: NodeJS.ProcessEnv = process.env) {
  const client = new MongoClient(env.MONGODB_URI as string);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: parseTrustedOrigins(env.TRUSTED_ORIGINS),
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
          input: false,
        },
      },
    },
    // ...accounts, verifications, socialProviders (GitHub, Google)
    hooks: {},
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

It is wired into NestJS in `src/app.module.ts`. `createAuth` is a factory so the environment is read after `ConfigModule` has loaded `.env`:

```ts
AuthModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: () => ({
    auth: createAuth(),
    disableTrustedOriginsCors: true, // CORS is configured in main.ts
  }),
}),
```

`AuthModule` mounts the Better Auth handler on `/api/auth/*`, registers a global `AuthGuard` and exports `AuthService` (inject it to call `authService.api.*`). Hooks can be added with the `@Hook()`, `@BeforeHook()` and `@AfterHook()` decorators — see the [library README](https://github.com/ThallesP/nestjs-better-auth#readme).

**Supported Providers:**

- Google
- GitHub
- Email/Password

Add more providers under `socialProviders` — see the [Better Auth docs](https://www.better-auth.com/docs/concepts/oauth).

---

## 🗄️ Database Migrations

If you use SQL databases (Postgres, MySQL, SQLite) instead of MongoDB, use the Better Auth CLI to create/apply the schema.

- Step 1: The CLI needs a file that exports the instance as `auth`. Create one next to the factory, for example `src/auth/auth-config.ts`:

  ```ts
  import 'dotenv/config';
  import { createAuth } from './auth.js';

  export const auth = createAuth();
  ```

  - Avoid path aliases; use relative imports so the CLI can resolve modules.
- Step 2 (Kysely/built-in adapter): Apply the schema directly:
  - `npx auth@latest migrate --config src/auth/auth-config.ts`
  - Add `--yes` to skip prompts.
- Step 2 (Prisma/Drizzle): Generate the schema, then run your ORM migrations:
  - `npx auth@latest generate --config src/auth/auth-config.ts`
  - Prisma: `npx prisma migrate dev -n better_auth_init`
  - Drizzle: run your drizzle-kit generate/push flow to apply the generated schema.

Notes
- Ensure your database connection env (e.g., `DATABASE_URL`) points to your Postgres/MySQL/SQLite instance.
- If the CLI can’t resolve imports, switch to relative paths in your config file (per docs).

Docs: https://www.better-auth.com/docs/concepts/cli

---

## 🌐 Cross-Domain Session Configuration

The application supports cross-domain cookies for production environments, allowing session sharing across subdomains. This is configured in `src/auth/auth.ts`:

```ts
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
  : {})
```

To enable cross-domain session sharing:

1. Add to your `.env` file:
   ```env
   CROSS_DOMAIN_ORIGIN=".yourdomain.com"  # Include the leading period
   ```

2. Ensure your frontend and API are on subdomains of the same parent domain:
   - API: `api.yourdomain.com`
   - Frontend: `app.yourdomain.com`

This configuration enables secure sharing of authentication cookies between your subdomains, maintaining session continuity for users navigating between different parts of your application.

For more details, refer to [Better Auth Cookies Documentation](https://www.better-auth.com/docs/concepts/cookies#cross-subdomain-cookies).

---

## 🛡️ Protecting Routes

`AuthModule` registers a global `AuthGuard`, so **every route is protected by default** — no `@UseGuards()` needed. Opt out per route or controller with `@AllowAnonymous()` (or `@OptionalAuth()`). See `app.controller.ts`:

```ts
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Protected: responds 401 without a session
  @Get('/cats')
  getCats(@Session() session: UserSession<Auth>, @UserId() userId: string) {
    return {
      message: this.appService.getCat(),
      userId,
      role: session.user.role, // typed from `additionalFields`
    };
  }

  // Public: the session is `null` for anonymous requests
  @Post('/cats')
  @AllowAnonymous()
  sayHello(
    @Session() session: UserSession<Auth> | null,
    @UserId() userId: string | undefined,
    @Body() body: unknown,
  ) {
    return {
      message: this.appService.getCat(),
      authenticated: Boolean(session && userId),
      body,
    };
  }
}
```

`Session`, `AllowAnonymous`, `OptionalAuth`, `Roles` and `UserSession` come from `@thallesp/nestjs-better-auth`; `UserId` is a small helper in `src/auth/user-id.decorator.ts`.

---

## 🌐 Global API Prefix

Set in `src/main.ts`:

```ts
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // required: Better Auth reads the raw body itself
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
```

> Keep `bodyParser: false`. `AuthModule` re-adds the JSON and urlencoded parsers for all non-auth routes.

---

## 🧩 Frontend Integration (Next.js)

Use `better-auth/react` to connect your frontend:

```ts
import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

export const { signIn, signUp, signOut, useSession } = createAuthClient({
  baseURL: "http://localhost:3000", // API base URL
  plugins: [
    inferAdditionalFields({
      user: {
        surname: { type: 'string' },
        role: { type: 'string', nullable: true },
      },
    }),
  ],
});
```

> Do **not** include `/api` in the baseURL.

---

## 🔁 Redirect After Sign-in

```ts
const { error, data } = await signIn.email({
  email,
  password,
  rememberMe,
  callbackURL: "http://localhost:3001/dashboard", // Frontend URL, not API
});
```

> callbackURL should point to the frontend URL where you want to redirect after sign-in.

---

## 🔒 Session Handling in Next.js

### Middleware (`middleware.ts`)

**Option 1: Check cookies**

```ts
import { getSessionCookie } from 'better-auth/cookies';

export async function middleware(request: NextRequest) {
  const cookies = getSessionCookie(request);
  if (!cookies) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}
```

**Option 2: Check session with API**

```ts
export async function middleware(request: NextRequest) {
  const res = await fetch("http://localhost:3000/api/auth/get-session", {
    headers: {
      cookie: request.headers.get('cookie') || '',
    },
  });

  const session = await res.json();
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}
```

---

### Server-side Rendering (`page.tsx`)

**Require Session**

```ts
export default async function Page() {
  const cookie = headers().get('cookie');

  const res = await fetch("http://localhost:3000/api/auth/get-session", {
    headers: { cookie: cookie || '' },
  });

  const session = await res.json();
  if (!session) {
    return redirect('/sign-in');
  }

  return (
    <div>
      <h1>Protected Page</h1>
    </div>
  );
}
```

**Fetch Data from Protected API**

```ts
export default async function Page() {
  const res = await fetch("http://localhost:3000/api/foo", {
    headers: {
      cookie: (await headers()).get('cookie') || '', // Include cookies for session
    },
    cache: 'no-store',
  });

  const data = await res.json();

  return (
    <div>
      <h1>Protected Page</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

---

### Client Component Example

```ts
'use client';

import { useSession } from '@/lib/auth-client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const { data: session } = useSession();
  const [data, setData] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.push('/sign-in');
    }
  }, [session, router]);

  useEffect(() => {
    async function fetchData() {
      const res = await fetch('http://localhost:3000/api/auth/foo', {
        credentials: 'include', // Include cookies for session
      });
      const result = await res.json();
      setData(result);
    }

    if (session) {
      fetchData();
    }
  }, [session]);

  return (
    <div>
      <h1>Protected Page</h1>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
```

---

## 🧪 Tips

- Use `.env` variables for all sensitive data.
- Ensure CORS is properly configured.
- Add the correct callback URLs in your OAuth provider settings.
- Don’t forget to include credentials when making authenticated fetch requests.
