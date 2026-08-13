import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import LoginPage from './pages/Login';
import PasswordResetRequiredPage from './pages/PasswordResetRequired';
import Dashboard from './pages/Dashboard';
import BatchList from './pages/BatchList';
import BatchDetail from './pages/BatchDetail';
import BatchReportViewer from './pages/BatchReportViewer';
import BatchAuditTrail from './pages/BatchAuditTrail';
import SystemAdminAuditTrail from './pages/SystemAdminAuditTrail';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import MainLayout from './layouts/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import { NotificationProvider } from './context/NotificationContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BranchProvider } from './context/BranchContext';

import ProductMasters from './pages/ProductMasters';
import DepartmentMasters from './pages/DepartmentMasters';
import DesignationMasters from './pages/DesignationMasters';
import BatchNumberEngine from './pages/BatchNumberEngine';
import BatchSheetMasters from './pages/BatchSheetMasters';
import BatchSheetMasterForm from './pages/BatchSheetMasterForm';
import BatchSheetMasterDetail from './pages/BatchSheetMasterDetail';
import BatchSheetMasterUpdate from './pages/BatchSheetMasterUpdate';
import BatchSheetRecordsApprovals from './pages/BatchSheetRecordsApprovals';
import BatchSheetRecordStatus from './pages/BatchSheetRecordStatus';
import CompletedBatchSheetRequests from './pages/CompletedBatchSheetRequests';
import RejectedBatchSheetRequests from './pages/RejectedBatchSheetRequests';
import BatchSheetRequestForm from './pages/BatchSheetRequestForm';
import NotificationsEmbed from './pages/NotificationsEmbed';
import ComplianceGuardian from './pages/ComplianceGuardian';

const AppRoutes = () => {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [initialCheckDone, setInitialCheckDone] = React.useState(false);

  React.useEffect(() => {
    (window as any).__appNavigate = (path: string) => {
      navigate(path);
    };
    return () => {
      try {
        delete (window as any).__appNavigate;
      } catch (e) {
        (window as any).__appNavigate = undefined;
      }
    };
  }, [navigate]);

  React.useEffect(() => {
    if (!loading) {
      if (user && !user.forcePasswordReset) {
        if (!initialCheckDone) {
          navigate('/', { replace: true });
          setInitialCheckDone(true);
        }
      } else if (!user) {
        setInitialCheckDone(false);
      }
    }
  }, [user, loading, initialCheckDone, navigate]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#151619] text-white">
      <div className="text-4xl font-bold tracking-tighter mb-4 animate-pulse">BRIMS</div>
      <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className="w-1/2 h-full bg-[#FF6321] animate-[loading_1.5s_ease-in-out_infinite]" />
      </div>
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );

  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/login" element={<LoginPage onLogin={login} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : user.forcePasswordReset ? (
        <>
          <Route path="/password-reset" element={<PasswordResetRequiredPage />} />
          <Route path="*" element={<Navigate to="/password-reset" replace />} />
        </>
      ) : (
        <>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/batch-number-generator-engine" element={<BatchNumberEngine />} />
            <Route path="/product-masters" element={<ProductMasters />} />
            <Route path="/department-masters" element={<DepartmentMasters />} />
            <Route path="/designation-masters" element={<DesignationMasters />} />
            <Route path="/batches" element={<BatchSheetRequestForm />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
            <Route path="/batches/:id/report" element={<BatchReportViewer />} />
            <Route path="/audit/batch" element={<BatchAuditTrail />} />
            <Route path="/audit/system" element={<SystemAdminAuditTrail />} />
            <Route path="/audit" element={<Navigate to="/audit/batch" replace />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/compliance-guardian" element={<ComplianceGuardian />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/batch-sheet-masters" element={<BatchSheetMasters />} />
            <Route path="/batch-sheet-masters/approvals" element={<BatchSheetRecordsApprovals />} />
            <Route path="/batch-sheet-records/status" element={<BatchSheetRecordStatus />} />
            <Route path="/batch-sheet-records/completed" element={<CompletedBatchSheetRequests />} />
            <Route path="/batch-sheet-records/rejected" element={<RejectedBatchSheetRequests />} />
            <Route path="/batch-sheet-masters/update" element={<BatchSheetMasterUpdate />} />
            <Route path="/batch-sheet-masters/new" element={<BatchSheetMasterForm />} />
            <Route path="/batch-sheet-masters/:id" element={<BatchSheetMasterDetail />} />
            <Route path="/batch-sheet-masters/:id/edit" element={<BatchSheetMasterForm />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="/notifications-embed" element={<NotificationsEmbed />} />
        </>
      )}
    </Routes>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BranchProvider>
          <NotificationProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
            <Toaster />
          </NotificationProvider>
        </BranchProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
