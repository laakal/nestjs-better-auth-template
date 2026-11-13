import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthGuard, type UserSession } from './auth/auth.guard.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    })
      // the guard is covered by auth.guard.spec.ts and the e2e tests
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns the cat with the session user on the protected route', () => {
    const session = {
      user: { id: 'user-1', role: 'admin' },
    } as UserSession;

    expect(appController.getCats(session, 'user-1')).toEqual({
      message: 'Meow',
      userId: 'user-1',
      role: 'admin',
    });
  });

  it('serves the public route without a session', () => {
    expect(appController.sayHello(null, undefined, { a: 1 })).toEqual({
      message: 'Meow',
      authenticated: false,
      body: { a: 1 },
    });
  });
});
