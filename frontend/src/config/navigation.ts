import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  Landmark,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';

export type NavGroupTitle =
  | 'Overview'
  | 'Azure Estate'
  | 'Applications'
  | 'Assessment Evidence'
  | 'Settings';

export type SettingsTabKey = 'data' | 'reports' | 'profiles';

export type AppPageId =
  | 'home'
  | 'estateOverview'
  | 'inventory'
  | 'applicationsDiscovery'
  | 'assessmentProgress'
  | 'assessmentReport'
  | 'deliverablesPlan'
  | 'costs'
  | 'security'
  | 'dynamics'
  | 'licenses'
  | 'portfolio'
  | 'challenges'
  | 'recommendations'
  | 'initiatives'
  | 'frameworkInsights'
  | 'stakeholders'
  | 'aboutOrganisation'
  | 'transcripts'
  | 'reportSettings'
  | 'governance'
  | 'legend'
  | 'dataPull'
  | 'profiles'
  | 'login';

export type DeliverableSourceKey =
  | 'assessmentSummary'
  | 'inventory'
  | 'cost'
  | 'dynamics'
  | 'integration'
  | 'security'
  | 'governance'
  | 'portfolio';

export type NavItem = {
  id: AppPageId;
  label: string;
  to: string;
  icon?: LucideIcon;
  exact?: boolean;
  sidebarSubsection?: string;
  settingsTab?: SettingsTabKey;
};

export type NavGroup = {
  title: NavGroupTitle;
  items: NavItem[];
  visibleInSidebar?: boolean;
};

type AppPageMeta = {
  id: AppPageId;
  path: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
  navGroup?: NavGroupTitle;
  visibleInSidebar?: boolean;
  sidebarSubsection?: string;
  settingsTab?: SettingsTabKey;
};

type RouteAlias = {
  from: string;
  to: string;
};

const GROUP_ORDER: NavGroupTitle[] = [
  'Overview',
  'Azure Estate',
  'Applications',
  'Assessment Evidence',
  'Settings',
];

const appPages: AppPageMeta[] = [
  { id: 'home', path: '/', label: 'Executive Summary', icon: LayoutGrid, exact: true, navGroup: 'Overview' },
  { id: 'estateOverview', path: '/estate-overview', label: 'Estate Overview', icon: LayoutGrid, exact: true, navGroup: 'Azure Estate' },
  { id: 'inventory', path: '/inventory', label: 'Azure Inventory', icon: Database, navGroup: 'Azure Estate' },
  { id: 'applicationsDiscovery', path: '/applications-discovery', label: 'Applications Discovery', icon: ClipboardList, navGroup: 'Applications' },
  { id: 'assessmentProgress', path: '/assessment-progress', label: 'Assessment Progress', icon: Gauge, navGroup: 'Overview' },
  { id: 'assessmentReport', path: '/assessment-report', label: 'Assessment Report', icon: FileText, navGroup: 'Overview' },
  { id: 'deliverablesPlan', path: '/deliverables-plan', label: 'Deliverable Planner', icon: FileText, navGroup: 'Settings', visibleInSidebar: false, settingsTab: 'reports' },
  { id: 'costs', path: '/costs', label: 'Cost Analysis', icon: BarChart3, navGroup: 'Azure Estate' },
  { id: 'security', path: '/security', label: 'Security & Health', icon: ShieldCheck, navGroup: 'Azure Estate', sidebarSubsection: 'Posture' },
  { id: 'dynamics', path: '/dynamics', label: 'Dynamics 365', icon: Layers3, navGroup: 'Azure Estate' },
  { id: 'licenses', path: '/licenses', label: 'Licenses', icon: Users, navGroup: 'Assessment Evidence' },
  { id: 'portfolio', path: '/portfolio', label: 'App Portfolio', icon: LayoutDashboard, navGroup: 'Applications' },
  { id: 'challenges', path: '/challenges', label: 'Challenges', icon: ListChecks, navGroup: 'Assessment Evidence' },
  { id: 'recommendations', path: '/recommendations', label: 'Recommendations', icon: FileText, navGroup: 'Assessment Evidence' },
  { id: 'initiatives', path: '/initiatives', label: 'Initiatives', icon: Workflow, navGroup: 'Assessment Evidence' },
  { id: 'frameworkInsights', path: '/framework-insights', label: 'Customer Assessments', icon: Workflow, navGroup: 'Azure Estate', sidebarSubsection: 'Posture' },
  { id: 'stakeholders', path: '/stakeholders', label: 'Stakeholder Notes', icon: MessagesSquare, navGroup: 'Assessment Evidence' },
  { id: 'aboutOrganisation', path: '/about-organisation', label: 'About Organisation', icon: Building2, navGroup: 'Assessment Evidence' },
  { id: 'transcripts', path: '/transcripts', label: 'Transcripts', icon: FileText, navGroup: 'Assessment Evidence' },
  { id: 'reportSettings', path: '/report-settings', label: 'Report Settings', icon: Settings2, navGroup: 'Settings', visibleInSidebar: false, settingsTab: 'reports' },
  { id: 'governance', path: '/governance', label: 'Governance', icon: Landmark, navGroup: 'Azure Estate', sidebarSubsection: 'Posture' },
  { id: 'legend', path: '/legend', label: 'Legend & Calculations', icon: BookOpen, navGroup: 'Settings', visibleInSidebar: false, settingsTab: 'reports' },
  { id: 'dataPull', path: '/data-pull', label: 'Data Pull', icon: Database, navGroup: 'Settings', visibleInSidebar: false, settingsTab: 'data' },
  { id: 'profiles', path: '/profiles', label: 'Profiles', icon: Users, navGroup: 'Settings', visibleInSidebar: false, settingsTab: 'profiles' },
  { id: 'login', path: '/login', label: 'Login' },
];

const pageMetaById = new Map<AppPageId, AppPageMeta>(appPages.map((page) => [page.id, page]));

function requirePageMeta(pageId: AppPageId): AppPageMeta {
  const page = pageMetaById.get(pageId);
  if (!page) {
    throw new Error(`Unknown app page id: ${pageId}`);
  }
  return page;
}

export const routePaths = Object.freeze(
  appPages.reduce(
    (acc, page) => {
      acc[page.id] = page.path;
      return acc;
    },
    {} as Record<AppPageId, string>,
  ),
);

export function getPageMeta(pageId: AppPageId): AppPageMeta {
  return requirePageMeta(pageId);
}

export function getNavItem(pageId: AppPageId): NavItem {
  const page = requirePageMeta(pageId);
  return {
    id: page.id,
    label: page.label,
    to: page.path,
    icon: page.icon,
    exact: page.exact,
    sidebarSubsection: page.sidebarSubsection,
    settingsTab: page.settingsTab,
  };
}

function buildNavGroups(): NavGroup[] {
  return GROUP_ORDER.map((title) => {
    const pages = appPages.filter((page) => page.navGroup === title);
    return {
      title,
      items: pages.map((page) => getNavItem(page.id)),
      visibleInSidebar: pages.some((page) => page.visibleInSidebar !== false),
    };
  }).filter((group) => group.items.length > 0);
}

export const navGroups: NavGroup[] = buildNavGroups();

export function findNavItemByPath(pathname: string): NavItem | null {
  for (const group of navGroups) {
    for (const item of group.items) {
      const isMatch =
        item.to === '/'
          ? pathname === '/'
          : pathname === item.to || pathname.startsWith(item.to + '/');

      if (isMatch) return item;
    }
  }
  return null;
}

export function findNavGroupByPath(pathname: string): NavGroup | null {
  const item = findNavItemByPath(pathname);
  if (!item) return null;
  for (const group of navGroups) {
    if (group.items.some((groupItem) => groupItem.id === item.id)) {
      return group;
    }
  }
  return null;
}

const deliverableSourcePageIds: Record<DeliverableSourceKey, AppPageId[]> = {
  assessmentSummary: [
    'assessmentReport',
    'aboutOrganisation',
    'challenges',
    'recommendations',
    'initiatives',
    'stakeholders',
    'dataPull',
    'frameworkInsights',
  ],
  inventory: ['inventory', 'applicationsDiscovery', 'costs'],
  cost: ['costs', 'inventory', 'governance'],
  dynamics: ['dynamics', 'costs', 'licenses'],
  integration: ['applicationsDiscovery', 'portfolio', 'stakeholders'],
  security: ['security', 'frameworkInsights', 'dataPull'],
  governance: ['governance', 'frameworkInsights', 'inventory'],
  portfolio: ['portfolio', 'applicationsDiscovery', 'initiatives', 'challenges'],
};

export function getDeliverableSourceLinks(key: DeliverableSourceKey): NavItem[] {
  return deliverableSourcePageIds[key].map((pageId) => getNavItem(pageId));
}

export const deliverableSourceLinks: Record<DeliverableSourceKey, NavItem[]> = Object.freeze(
  (Object.keys(deliverableSourcePageIds) as DeliverableSourceKey[]).reduce(
    (acc, key) => {
      acc[key] = getDeliverableSourceLinks(key);
      return acc;
    },
    {} as Record<DeliverableSourceKey, NavItem[]>,
  ),
);

export const settingsTabLinks: Record<SettingsTabKey, NavItem[]> = Object.freeze({
  data: appPages.filter((page) => page.settingsTab === 'data').map((page) => getNavItem(page.id)),
  reports: appPages.filter((page) => page.settingsTab === 'reports').map((page) => getNavItem(page.id)),
  profiles: appPages.filter((page) => page.settingsTab === 'profiles').map((page) => getNavItem(page.id)),
});

export const routeAliases: readonly RouteAlias[] = Object.freeze([
  { from: 'state-overview', to: routePaths.estateOverview },
  { from: 'assessment-process', to: routePaths.assessmentProgress },
  { from: 'narrative', to: routePaths.assessmentReport },
  { from: 'data-gaps', to: routePaths.dataPull },
  { from: 'report-copy', to: routePaths.assessmentReport },
]);

/**
 * Convert an absolute route path (e.g. '/inventory') to a relative segment
 * suitable for use as a React Router nested `path` prop.
 * Throws at runtime if the path does not begin with '/', so misuse is caught early.
 */
export function toRelativePath(absolutePath: string): string {
  if (!absolutePath.startsWith('/')) {
    throw new Error(
      `toRelativePath: expected a path starting with '/', got "${absolutePath}"`,
    );
  }
  return absolutePath.slice(1);
}
