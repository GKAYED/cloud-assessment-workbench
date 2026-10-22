export type CsvRow = Record<string, unknown>;
import { downloadWorkbook } from './excel';

export function downloadCsv(fileName: string, rows: CsvRow[]): void {
  downloadWorkbook(fileName, [{ name: 'Export', rows }]);
}

export function downloadCsvBundle(files: Array<{ fileName: string; rows: CsvRow[] }>): void {
  if (!files.length) return;
  if (files.length === 1) {
    downloadCsv(files[0].fileName, files[0].rows);
    return;
  }

  const baseName = files[0].fileName.replace(/-(?:[^-]+)$/i, '') || 'assessment-export-pack';
  downloadWorkbook(
    `${baseName}-workbook`,
    files.map((file) => ({ name: file.fileName, rows: file.rows })),
  );
}
