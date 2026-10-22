/**
 * CopyImageButton — renders a DOM element to PNG and copies to clipboard.
 * Shows brief "Copied!" feedback. Designed for chart cards and diagrams.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { copyElementAsImage } from '../../utils/clipboard';

interface CopyImageButtonProps {
  /** Ref callback to get the target element, OR a string id to querySelector */
  targetRef?: React.RefObject<HTMLElement | null>;
  targetId?: string;
  label?: string;
  className?: string;
}

export const CopyImageButton: React.FC<CopyImageButtonProps> = ({
  targetRef,
  targetId,
  label = 'Copy as image',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    const el = targetRef?.current ?? (targetId ? document.getElementById(targetId) : null);
    if (!el) return;
    const ok = await copyElementAsImage(el);
    if (ok) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [targetRef, targetId]);

  return (
    <button
      type="button"
      className={`table-export-button ${className}`}
      onClick={handleCopy}
      title={label}
    >
      {copied ? <Check size={15} /> : <Camera size={15} />}
      {copied ? 'Copied!' : label}
    </button>
  );
};
