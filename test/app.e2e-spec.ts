import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

// These tests never reach the database: MongoClient connects lazily and
// requests without a session cookie are rejected before any query runs.
describe('App (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/better-auth-e2e';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Mirror main.ts
    app = moduleFixture.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/cats rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/api/cats').expect(401);
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

  it('GET /api/auth/ok is served by Better Auth outside the global prefix', () => {
    return request(app.getHttpServer())
      .get('/api/auth/ok')
      .expect(200)
      .expect({ ok: true });
  });
});
