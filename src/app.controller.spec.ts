import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import type { Auth } from './auth/auth.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('returns the cat with the session user on the protected route', () => {
    const session = {
      user: { id: 'user-1', role: 'admin' },
    } as UserSession<Auth>;

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
