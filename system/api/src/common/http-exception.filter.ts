import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Uniform JSON errors with Arabic messages; DB integrity errors become 409. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Error');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) {
      const r = e.getResponse() as any;
      const message = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join('، ') : r.message;
      return res.status(e.getStatus()).json({ statusCode: e.getStatus(), message });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'القيمة موجودة مسبقًا' });
      if (e.code === 'P2003') return res.status(409).json({ statusCode: 409, message: 'السجل مرتبط بسجلات أخرى' });
      if (e.code === 'P2025') return res.status(404).json({ statusCode: 404, message: 'السجل غير موجود' });
    }
    const msg = String((e as Error)?.message || '');
    if (/locked|append-only|cannot be deleted|only be reversed/.test(msg)) {
      return res.status(409).json({ statusCode: 409, message: 'هذا السجل مُرحّل ومقفل ولا يمكن تعديله' });
    }
    this.log.error(e);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ statusCode: 500, message: 'حدث خطأ غير متوقع' });
  }
}
