/**
 * SectionNav — sticky in-page section navigation bar.
 *
 * Renders a horizontal tab bar that scrolls to named sections and highlights
 * the currently visible section using IntersectionObserver.
 */

import { useEffect, useRef, useState } from 'react';

export interface SectionDef {
  id: string;
  label: string;
}

interface SectionNavProps {
  sections: SectionDef[];
}

export function SectionNav({ sections }: SectionNavProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );

    const observer = observerRef.current;
    for (const sec of sections) {
      const el = document.getElementById(sec.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
    }
  };

  return (
    <nav className="section-nav" aria-label="Page sections">
      {sections.map((sec) => (
        <button
          key={sec.id}
          className={`section-nav__tab ${activeId === sec.id ? 'section-nav__tab--active' : ''}`}
          onClick={() => handleClick(sec.id)}
        >
          {sec.label}
        </button>
      ))}
    </nav>
  );
}
