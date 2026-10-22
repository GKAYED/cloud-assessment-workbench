/**
 * Header — top bar with profile switcher, theme toggle,
 * and authentication status indicator.
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Moon, Sun,
  ChevronDown, ShieldCheck, ShieldAlert, Database,
} from 'lucide-react';
import { useProfile } from '../../hooks/useProfile';
import { useAppSettings } from '../../hooks/useAppSettings';
import { routePaths } from '../../config/navigation';
import { toSentenceCase } from '../../utils/text';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export const Header: React.FC = () => {
  const {
    activeProfile, profiles,
    loadProfiles, setActiveProfile, isAuthenticated,
  } = useProfile();
  const {
    theme, toggleTheme,
  } = useAppSettings();
  const navigate = useNavigate();

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    const profile = profiles.find((p) => p.id === id) ?? null;
    setActiveProfile(profile);
  };


  return (
    <>
      <header className="header header--real">
        <div className="header-left">
          <h1 className="header-title">{toSentenceCase('Cloud Assessment Workbench')}</h1>
          {/* Compact auth status pill shown as read-only status text */}
          {activeProfile && (
            <span
              role="status"
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-normal select-none',
                isAuthenticated
                  ? 'border-green-500/40 bg-green-500/10 text-green-400 dark:bg-green-500/15'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400 dark:bg-amber-500/15',
              )}
            >
              {isAuthenticated
                ? <><ShieldCheck size={12} /> Connected</>
                : <><ShieldAlert size={12} /> Not Authenticated</>}
            </span>
          )}
        </div>

        <div className="header-controls">
          {/* Dark / Light toggle — shadcn Button ghost */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="header-toggle toggle-theme gap-1.5"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </Button>

          {/* Data Pull navigation — shadcn Button ghost */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(routePaths.dataPull)}
            title="Open Data Pull to fetch assessment data"
            className="header-toggle gap-1.5"
          >
            <Database size={14} />
            <span>Data Pull</span>
          </Button>

          {/* Profile Switcher — keeps legacy class for the select element */}
          <div className="header-profile-switcher">
            <User size={14} />
            {profiles.length > 0 ? (
              <select
                className="header-profile-select"
                value={activeProfile?.id ?? ''}
                onChange={handleProfileChange}
                aria-label="Active profile"
              >
                <option value="" disabled>
                  Select Profile
                </option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.customer_name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="header-no-profiles">No Profiles</span>
            )}
            <ChevronDown size={12} className="header-chevron" />
          </div>
        </div>
      </header>
    </>
  );
};
