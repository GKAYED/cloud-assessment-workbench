/**
 * Breadcrumb — shows "Group › Page" based on current route.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { findNavGroupByPath, findNavItemByPath } from '../../config/navigation';
import { toSentenceCase } from '../../utils/text';

export const Breadcrumb: React.FC = () => {
  const { pathname } = useLocation();
  const group = findNavGroupByPath(pathname);
  const item = findNavItemByPath(pathname);

  if (group && item) {
    return (
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span className="breadcrumb-group">{group.title}</span>
        <ChevronRight size={14} className="breadcrumb-sep" />
        <Link to={item.to} className="breadcrumb-page" aria-current="page">
          {toSentenceCase(item.label)}
        </Link>
      </nav>
    );
  }

  return null;
};
