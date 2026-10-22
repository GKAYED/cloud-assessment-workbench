/**
 * Sidebar — primary application navigation with grouped sections.
 */

import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import { navGroups, settingsTabLinks } from '../../config/navigation';
import type { NavGroup, NavItem } from '../../config/navigation';

function SidebarLink({
  to,
  label,
  icon: Icon,
  exact,
  compact,
}: NavItem & { compact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact ?? false}
      className={({ isActive }) =>
        [
          'sidebar-link',
          compact ? 'sidebar-link--compact' : '',
          isActive ? 'active' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
    >
      {Icon ? <Icon size={15} className="sidebar-link__icon" /> : null}
      <span>{label}</span>
    </NavLink>
  );
}

function SidebarGroup({ title, items }: Pick<NavGroup, 'title' | 'items'>) {
  const [open, setOpen] = useState(true);
  const subsectionItems = items.filter((item) => item.sidebarSubsection);
  const mainItems = items.filter((item) => !item.sidebarSubsection);
  const subsectionGroups = [...new Set(subsectionItems.map((item) => item.sidebarSubsection))];

  return (
    <div className={`sidebar-group${open ? ' sidebar-group--open' : ''}`}>
      <Button
        variant="ghost"
        size="sm"
        className="sidebar-group__toggle w-full justify-between px-2 font-medium text-xs uppercase tracking-wider"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown size={14} className="sidebar-group__chevron" />
      </Button>
      {open && (
        <div className="sidebar-group__items">
          {mainItems.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
          {subsectionGroups.map((subsection) => (
            <div key={subsection} className="sidebar-subsection">
              <div className="sidebar-subsection__title">{subsection}</div>
              <div className="sidebar-subsection__items">
                {subsectionItems
                  .filter((item) => item.sidebarSubsection === subsection)
                  .map((item) => (
                    <SidebarLink key={item.to} {...item} compact />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'data' | 'reports' | 'profiles'>('data');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const tabs = [
    { key: 'data' as const, label: 'Data', items: settingsTabLinks.data },
    { key: 'reports' as const, label: 'Reports', items: settingsTabLinks.reports },
    { key: 'profiles' as const, label: 'Profiles', items: settingsTabLinks.profiles },
  ];

  const currentTab = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];

  return (
    <div className="sidebar-settings" ref={menuRef}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'sidebar-settings__trigger w-full justify-between px-2',
          open && 'sidebar-settings__trigger--open',
        )}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Settings2 size={16} />
        <span>Settings</span>
        <ChevronRight size={14} className={cn('sidebar-settings__chevron', open && 'sidebar-settings__chevron--open')} />
      </Button>

      {open && (
        <div className="sidebar-settings__panel" role="dialog" aria-label="Settings navigation">
          <div className="sidebar-settings__tabs" role="tablist" aria-label="Settings tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={tab.key === activeTab}
                className={cn(
                  'sidebar-settings__tab flex-1',
                  tab.key === activeTab && 'sidebar-settings__tab--active',
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="sidebar-settings__links">
            {currentTab.items.map((item) => (
              <SidebarLink key={item.to} {...item} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const visibleGroups = navGroups.filter((group) => group.visibleInSidebar !== false);

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <nav className="sidebar-nav">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.title} title={group.title} items={group.items} />
        ))}
      </nav>
      <div className="sidebar-footer">
        <SettingsMenu />
      </div>
    </aside>
  );
}
