import { useCallback, useEffect, useRef, useState } from 'react';
import { copySectionToClipboard } from '../../../utils/clipboard';

export function SectionHeading({ num, title, sectionId }: { num: string; title: string; sectionId: string }) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const ok = await copySectionToClipboard(section);
    if (ok) {
      setCopied(true);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 2000);
    }
  }, [sectionId]);

  return (
    <div className="rpt-section__header-row">
      <h2 className="rpt-section__heading">
        <span className="rpt-section__num">{num}</span>{title}
      </h2>
      <button className="rpt-section__copy-btn" onClick={handleCopy} title="Copy section to clipboard">
        {copied ? '✓ Copied' : '⎘ Copy section'}
      </button>
    </div>
  );
}
