import { Injectable, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Auth } from './../src/auth/auth.js';
import { AuthService } from './../src/auth/auth.service.js';
import {
  AfterHook,
  type AuthHookContext,
  BeforeHook,
  Hook,
} from './../src/auth/decorators.js';
import { AUTH_INSTANCE_KEY } from './../src/auth/symbols.js';

const ORIGIN = 'http://localhost:3001';
const user = {
  name: 'Tom',
  email: 'tom@example.com',
  password: 'correct-horse-battery',
};

/** A provider with injected state, to check hooks are bound to their instance */
@Injectable()
class HookRecorder {
  readonly calls: string[] = [];
}

@Hook()
@Injectable()
class SignUpHooks {
  constructor(private readonly recorder: HookRecorder) {}

  @BeforeHook('/sign-up/email')
  before(ctx: AuthHookContext) {
    this.recorder.calls.push(`before ${ctx.path}`);
  }

  @AfterHook('/sign-up/email')
  after(ctx: AuthHookContext) {
    this.recorder.calls.push(`after ${ctx.path}`);
  }
}

@Module({ providers: [HookRecorder, SignUpHooks] })
class HooksModule {}

describe('App (e2e)', () => {
  let mongo: MongoMemoryServer;
  let app: NestExpressApplication;
  let recorder: HookRecorder;

  beforeAll(async () => {
    // Real MongoDB, in memory: the whole auth flow runs against a database
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri('better-auth-e2e');
    process.env.TRUSTED_ORIGINS = ORIGIN;
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.BETTER_AUTH_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e';

    // Imported after the environment is set: AuthModule.forRoot() reads it
    // when AppModule is defined.
    const { AppModule } = await import('./../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, HooksModule],
    }).compile();

    // Mirror main.ts
    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.setGlobalPrefix('api');
    await app.init();

    recorder = app.get(HookRecorder);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  const signUp = () =>
    request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send(user);

  describe('without a session', () => {
    it('GET /api/cats is rejected with 401', () => {
      return request(app.getHttpServer())
        .get('/api/cats')
        .expect(401)
        .expect(({ body }) => {
          expect(body).toMatchObject({ message: 'Unauthorized' });
        });
    });

    it('POST /api/cats is public and parses the JSON body', () => {
      return request(app.getHttpServer())
        .post('/api/cats')
        .send({ name: 'Tom' })
        .expect(201)
        .expect({
          message: 'Meow',
          authenticated: false,
          body: { name: 'Tom' },
        });
    });

    it('Better Auth is mounted on /api/auth, outside the global prefix', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/ok')
        .expect(200)
        .expect({ ok: true });
      await request(app.getHttpServer()).get('/api/api/auth/ok').expect(404);
    });

    it('GET /api/auth/get-session returns null', () => {
      return request(app.getHttpServer())
        .get('/api/auth/get-session')
        .expect(200)
        .expect(({ body }) => expect(body).toBeNull());
    });
  });

  describe('auth flow', () => {
    let cookies: string[];
    let userId: string;

    it('signs up with email and password and runs the @Hook() methods', async () => {
      const res = await signUp()
        // must be ignored: `role` is not a user-settable field
        .send({ ...user, role: 'admin' })
        .expect(200);

      const body = res.body as { user: { id: string; role: string } };
      userId = body.user.id;
      expect(body.user).toMatchObject({ email: user.email, role: 'user' });
      expect(recorder.calls).toEqual([
        'before /sign-up/email',
        'after /sign-up/email',
      ]);
    });

    it('rejects a duplicate sign up', async () => {
      const res = await signUp();
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a wrong password', () => {
      return request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
    });

    it('signs in and sets the session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email: user.email, password: user.password })
        .expect(200);

      cookies = res.get('Set-Cookie') ?? [];
      expect(cookies.join(';')).toContain('better-auth.session_token=');
    });

    it('GET /api/cats injects @Session() and @UserId()', () => {
      return request(app.getHttpServer())
        .get('/api/cats')
        .set('Cookie', cookies)
        .expect(200)
        .expect({ message: 'Meow', userId, role: 'user' });
    });

    it('the public route sees the session when one is present', () => {
      return request(app.getHttpServer())
        .post('/api/cats')
        .set('Cookie', cookies)
        .send({ a: 1 })
        .expect(201)
        .expect({ message: 'Meow', authenticated: true, body: { a: 1 } });
    });

    it('AuthService exposes the Better Auth server API', async () => {
      const authService = app.get(AuthService);
      expect(authService.instance).toBe(app.get<Auth>(AUTH_INSTANCE_KEY));

      const session = await authService.api.getSession({
        headers: new Headers({ cookie: cookies.join('; ') }),
      });
      expect(session?.user.id).toBe(userId);
    });

    it('signs out and the session stops working', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/sign-out')
        .set('Origin', ORIGIN)
        .set('Cookie', cookies)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/cats')
        .set('Cookie', cookies)
        .expect(401);
    });
  });
});
