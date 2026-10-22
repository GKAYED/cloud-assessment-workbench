/**
 * App.tsx — root router with layout shell.
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Breadcrumb } from './components/layout/Breadcrumb';
import { LoadingIndicator } from './components/layout/LoadingIndicator';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { useProfile } from './hooks/useProfile';
import { warmSnapshotCacheOnce } from './cache/warmSnapshotCache';
import { routeAliases, routePaths, toRelativePath } from './config/navigation';
import './App.css';

// Lazy-loaded pages
const Login = lazy(() => import('./pages/Login'));
const ProfileSelector = lazy(() => import('./pages/ProfileSelector'));
const ExecutiveSummary = lazy(() => import('./pages/ExecutiveSummary'));
const Inventory = lazy(() => import('./pages/Inventory'));
const CostAnalysis = lazy(() => import('./pages/CostAnalysis'));
const SecurityHealth = lazy(() => import('./pages/SecurityHealth'));
const Dynamics365 = lazy(() => import('./pages/Dynamics365'));
const LicenseManagement = lazy(() => import('./pages/LicenseManagement'));
const AppPortfolio = lazy(() => import('./pages/AppPortfolio'));
const Challenges = lazy(() => import('./pages/Challenges'));
const Recommendations = lazy(() => import('./pages/Recommendations'));
const Initiatives = lazy(() => import('./pages/Initiatives'));
const FrameworkInsights = lazy(() => import('./pages/FrameworkInsights'));
const StakeholderInterviews = lazy(() => import('./pages/StakeholderInterviews'));
const ReportSettings = lazy(() => import('./pages/ReportSettings'));
const Governance = lazy(() => import('./pages/Governance'));
const DataPull = lazy(() => import('./pages/DataPull'));
const ApplicationsDiscovery = lazy(() => import('./pages/ApplicationsDiscovery'));
const CalculationLegend = lazy(() => import('./pages/CalculationLegend'));
const AboutOrganisation = lazy(() => import('./pages/AboutOrganisation'));
const Transcripts = lazy(() => import('./pages/Transcripts'));
const DeliverablePlanner = lazy(() => import('./pages/DeliverablePlanner'));
const AssessmentProcess = lazy(() => import('./pages/AssessmentProcess'));
const AssessmentReport = lazy(() => import('./pages/AssessmentReportRoute'));
const EstateOverview = lazy(() => import('./pages/EstateOverview'));

function ScrollToTopOnRouteChange() {
  const location = useLocation();

  React.useEffect(() => {
    const container = document.querySelector('.app-content');
    if (container instanceof HTMLElement) {
      container.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return null;
}

function WarmSnapshotCacheOnProfile() {
  const { activeProfile } = useProfile();

  React.useEffect(() => {
    if (!activeProfile?.id) return;
    void warmSnapshotCacheOnce(activeProfile.id);
  }, [activeProfile?.id]);

  return null;
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <ScrollToTopOnRouteChange />
      <WarmSnapshotCacheOnProfile />
      <Sidebar />
      <div className="app-main">
        <Header />
        <Breadcrumb />
        <div className="app-content">
          <Suspense fallback={<LoadingIndicator />}>{children}</Suspense>
        </div>
      </div>
    </div>
  );
}

function App() {
  const protectedRoutes = [
    { path: routePaths.estateOverview, element: <EstateOverview /> },
    { path: routePaths.inventory, element: <Inventory /> },
    { path: routePaths.applicationsDiscovery, element: <ApplicationsDiscovery /> },
    { path: routePaths.assessmentProgress, element: <AssessmentProcess /> },
    { path: routePaths.deliverablesPlan, element: <DeliverablePlanner /> },
    { path: routePaths.costs, element: <CostAnalysis /> },
    { path: routePaths.security, element: <SecurityHealth /> },
    { path: routePaths.dynamics, element: <Dynamics365 /> },
    { path: routePaths.licenses, element: <LicenseManagement /> },
    { path: routePaths.portfolio, element: <AppPortfolio /> },
    { path: routePaths.challenges, element: <Challenges /> },
    { path: routePaths.recommendations, element: <Recommendations /> },
    { path: routePaths.initiatives, element: <Initiatives /> },
    { path: routePaths.frameworkInsights, element: <FrameworkInsights /> },
    { path: routePaths.stakeholders, element: <StakeholderInterviews /> },
    { path: routePaths.assessmentReport, element: <AssessmentReport /> },
    { path: routePaths.aboutOrganisation, element: <AboutOrganisation /> },
    { path: routePaths.transcripts, element: <Transcripts /> },
    { path: routePaths.reportSettings, element: <ReportSettings /> },
    { path: routePaths.governance, element: <Governance /> },
    { path: routePaths.legend, element: <CalculationLegend /> },
    { path: routePaths.dataPull, element: <DataPull /> },
  ];

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingIndicator />}>
          <Routes>
            <Route path={routePaths.login} element={<Login />} />
            {/* Profiles page is always accessible (needed for auth setup) */}
            <Route
              path={routePaths.profiles}
              element={
                <AppShell>
                  <ProfileSelector />
                </AppShell>
              }
            />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <Routes>
                      <Route index element={<ExecutiveSummary />} />
                      {protectedRoutes.map((route) => (
                        <Route key={route.path} path={toRelativePath(route.path)} element={route.element} />
                      ))}
                      {routeAliases.map((alias) => (
                        <Route key={alias.from} path={alias.from} element={<Navigate to={alias.to} replace />} />
                      ))}
                    </Routes>
                  </AppShell>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
