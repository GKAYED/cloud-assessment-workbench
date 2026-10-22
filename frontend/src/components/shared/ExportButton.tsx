/**
 * ExportButton — triggers PDF export via html2pdf.js.
 */

import React, { useCallback } from 'react';
import { Download } from 'lucide-react';

interface ExportButtonProps {
  targetId: string;
  filename?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  targetId,
  filename = 'Cloud Assessment Workbench-Report',
}) => {
  const handleExport = useCallback(async () => {
    const element = document.getElementById(targetId);
    if (!element) return;

    // Dynamic import to avoid SSR issues and reduce bundle size
    const html2pdf = (await import('html2pdf.js')).default;

    const opts = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `${filename}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const },
      };
    html2pdf()
      .set(opts)
      .from(element)
      .save();
  }, [targetId, filename]);

  return (
    <button className="btn btn-primary" onClick={handleExport}>
      <Download size={16} />
      <span>Export PDF</span>
    </button>
  );
};
