/**
 * PageLayout — wraps page content with a title bar and optional export button.
 */

import React from 'react';
import { ExportButton } from '../shared/ExportButton';
import { toSentenceCase } from '../../utils/text';

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  exportId?: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  subtitle,
  children,
  exportId,
}) => {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">{toSentenceCase(title)}</h2>
          {subtitle && <p className="page-subtitle">{toSentenceCase(subtitle)}</p>}
        </div>
        {exportId && <ExportButton targetId={exportId} filename={title} />}
      </div>
      <div className="page-content" id={exportId}>
        {children}
      </div>
    </div>
  );
};
