import { Injectable, type NestMiddleware } from '@nestjs/common';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

/**
 * Factory for the middleware that parses JSON / urlencoded bodies for every
 * route except the Better Auth ones, which must receive the raw request body.
 * (`bodyParser: false` is set in main.ts, so Nest does not parse anything itself.)
 */
export function createSkipBodyParsingMiddleware(basePath: string) {
  const jsonParser = express.json();
  const urlencodedParser = express.urlencoded({ extended: true });

  @Injectable()
  class SkipBodyParsingMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
      const path = req.originalUrl;

      // skip body parsing for better-auth routes
      if (path === basePath || path.startsWith(`${basePath}/`)) {
        next();
        return;
      }

      // Parse the body as usual
      jsonParser(req, res, (err?: unknown) => {
        if (err) {
          next(err);
          return;
        }
        urlencodedParser(req, res, next);
      });
    }
  }

  return SkipBodyParsingMiddleware;
}
