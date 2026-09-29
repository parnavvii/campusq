import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/layout/ProtectedRoute';
import LandingPage from './pages/public/LandingPage';
import ExplorePage from './pages/public/ExplorePage';
import PlacePage from './pages/public/PlacePage';
import DisplayBoardPage from './pages/public/DisplayBoardPage';
import TrackPage from './pages/public/TrackPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import BusinessSignupPage from './pages/auth/BusinessSignupPage';
import MyVisitsPage from './pages/customer/MyVisitsPage';
import BookPage from './pages/customer/BookPage';
import HistoryPage from './pages/customer/HistoryPage';
import StaffDashboard from './pages/staff/StaffDashboard';
import QueueManagementPage from './pages/staff/QueueManagementPage';
import ManageServicesPage from './pages/admin/ManageServicesPage';
import ManageStaffPage from './pages/admin/ManageStaffPage';
import BusinessSettingsPage from './pages/admin/BusinessSettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import Spinner from './components/ui/Spinner';

// Charts (Recharts) are only needed on the statistics and report pages, so load them on demand.
const StatisticsPage = lazy(() => import('./pages/staff/StatisticsPage'));
const ReportsPage = lazy(() => import('./pages/staff/ReportsPage'));
const withCharts = (el) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      {/* Sign-in screens have their own layout */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/staff/login" element={<Navigate to="/login" replace />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/business/new" element={<BusinessSignupPage />} />

      {/* Public, no login: a business's waiting-room screen and walk-in token tracking */}
      <Route path="/p/:slug/board" element={<DisplayBoardPage />} />
      <Route path="/p/:slug/track" element={<TrackPage />} />

      <Route element={<AppShell />}>
        {/* Open to everyone */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/p/:slug" element={<PlacePage />} />

        <Route element={<ProtectedRoute roles={['CUSTOMER']} />}>
          <Route path="/me" element={<MyVisitsPage />} />
          <Route path="/me/history" element={<HistoryPage />} />
          <Route path="/p/:slug/book/:serviceId" element={<BookPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['STAFF', 'ADMIN']} />}>
          <Route path="/staff" element={<StaffDashboard />} />
          <Route path="/staff/services/:id" element={<QueueManagementPage />} />
          <Route path="/staff/services/:id/stats" element={withCharts(<StatisticsPage />)} />
          <Route path="/staff/reports" element={withCharts(<ReportsPage />)} />
        </Route>

        <Route element={<ProtectedRoute roles={['ADMIN']} />}>
          <Route path="/admin/services" element={<ManageServicesPage />} />
          <Route path="/admin/staff" element={<ManageStaffPage />} />
          <Route path="/admin/business" element={<BusinessSettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
