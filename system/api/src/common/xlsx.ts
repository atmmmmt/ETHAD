import * as ExcelJS from 'exceljs';
import { Response } from 'express';

export interface Col { key: string; header: string; width?: number; money?: boolean }

/** Streams a right-to-left, branded Excel sheet. */
export async function sendXlsx(res: Response, fileName: string, title: string, cols: Col[], rows: Record<string, unknown>[], footer?: Record<string, unknown>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نادي الأهلي · الاتحاد الحلبي';
  const ws = wb.addWorksheet(title.slice(0, 30), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] });
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = `نادي الأهلي · الاتحاد الحلبي — ${title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFD71920' } };
  ws.getCell(2, 1).value = `تاريخ الاستخراج: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  ws.getRow(3).values = cols.map((c) => c.header);
  ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B0F14' } };
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? (c.money ? 16 : 22); if (c.money) ws.getColumn(i + 1).numFmt = '#,##0.00;[Red]-#,##0.00'; });
  rows.forEach((r) => ws.addRow(cols.map((c) => r[c.key] as ExcelJS.CellValue)));
  if (footer) { const f = ws.addRow(cols.map((c) => footer[c.key] as ExcelJS.CellValue)); f.font = { bold: true }; }
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}.xlsx`);
  res.send(Buffer.from(buf as ArrayBuffer));
}
