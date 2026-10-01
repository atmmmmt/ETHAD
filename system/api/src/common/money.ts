import { Prisma } from '@prisma/client';

/** All arithmetic on money goes through integer cents to avoid float drift. */
export const toCents = (v: Prisma.Decimal | number | string | null | undefined) =>
  Math.round(Number(v ?? 0) * 100);
export const fromCents = (c: number) => Math.round(c) / 100;
export const dec = (n: number) => new Prisma.Decimal(fromCents(Math.round(n * 100)).toFixed(2));
export const num = (v: Prisma.Decimal | number | string | null | undefined) => Number(v ?? 0);
