import * as XLSX from 'xlsx';
import type { CsvRow } from './csv';
import { getActiveProfileSnapshot } from '../hooks/useProfile';

export type WorkbookSheet = {
  name: string;
  rows: CsvRow[];
};

function sanitizeFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function buildMeaningfulFileName(fileName: string) {
  const activeProfile = getActiveProfileSnapshot();
  const profileName = activeProfile?.customer_name?.trim() || 'assessment';
  const baseName = fileName?.trim() || 'export';
  const combined = `${profileName} ${baseName}`;
  return sanitizeFileName(combined) || 'assessment-export';
}

function normalizeSheetName(name: string, index: number) {
  const trimmed = name.trim().replace(/[\\/?*[\]:]/g, ' ');
  const base = trimmed.slice(0, 28).trim() || `Sheet ${index + 1}`;
  return base;
}

function autoWidth(rows: CsvRow[], headers: string[]) {
  return headers.map((header) => {
    const headerLength = header.length;
    const maxCell = rows.reduce((max, row) => {
      const value = row[header];
      const text =
        value == null
          ? ''
          : typeof value === 'string'
            ? value
            : typeof value === 'number' || typeof value === 'boolean'
              ? String(value)
              : Array.isArray(value)
                ? value.join('; ')
                : JSON.stringify(value);
      return Math.max(max, text.length);
    }, headerLength);
    return { wch: Math.min(Math.max(maxCell + 2, 14), 48) };
  });
}

function applyWorksheetFormatting(worksheet: XLSX.WorkSheet, rows: CsvRow[], headers: string[]) {
  if (!headers.length) {
    worksheet['!cols'] = [{ wch: 24 }];
    return;
  }

  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');
  worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  worksheet['!cols'] = autoWidth(rows, headers);
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const headerCellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    const headerCell = worksheet[headerCellRef];
    if (!headerCell) continue;
    headerCell.s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2F3542' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: '1F2937' } },
        bottom: { style: 'thin', color: { rgb: '1F2937' } },
        left: { style: 'thin', color: { rgb: '1F2937' } },
        right: { style: 'thin', color: { rgb: '1F2937' } },
      },
    };
  }

  for (let row = 1; row <= range.e.r; row += 1) {
    const fill = row % 2 === 0 ? 'F3F4F6' : 'FFFFFF';
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const ref = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[ref];
      if (!cell) continue;
      cell.s = {
        fill: { fgColor: { rgb: fill } },
        alignment: { vertical: 'top', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: 'D1D5DB' } },
          bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
          left: { style: 'thin', color: { rgb: 'D1D5DB' } },
          right: { style: 'thin', color: { rgb: 'D1D5DB' } },
        },
      };
    }
  }
}

export function downloadWorkbook(fileName: string, sheets: WorkbookSheet[]) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet, index) => {
    const headers = Array.from(new Set(sheet.rows.flatMap((row) => Object.keys(row))));
    const worksheet = headers.length
      ? XLSX.utils.json_to_sheet(sheet.rows, { header: headers })
      : XLSX.utils.aoa_to_sheet([['No data available']]);

    applyWorksheetFormatting(worksheet, sheet.rows, headers);

    XLSX.utils.book_append_sheet(workbook, worksheet, normalizeSheetName(sheet.name, index));
  });

  XLSX.writeFileXLSX(workbook, `${buildMeaningfulFileName(fileName)}.xlsx`, { cellStyles: true });
}
