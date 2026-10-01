import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import * as express from 'express';
import { AppModule } from './app.module';

// Prisma returns BigInt for AuditLog ids; serialise as string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () { return this.toString(); };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  // In production the API also serves the built web app (one container, one origin).
  const web = resolve(process.env.WEB_DIST || join(__dirname, '../../web/dist'));
  if (existsSync(join(web, 'index.html'))) {
    const server = app.getHttpAdapter().getInstance();
    server.use(express.static(web, { index: false, maxAge: '7d' }));
    server.get(/^\/(?!api\/).*/, (_req: express.Request, res: express.Response) => res.sendFile(join(web, 'index.html')));
  }
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();
