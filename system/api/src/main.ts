import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Prisma returns BigInt for AuditLog ids; serialise as string.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () { return this.toString(); };

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`API listening on :${port}`);
}
bootstrap();
