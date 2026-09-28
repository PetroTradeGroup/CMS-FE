import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { isAuthenticated } from './services/auth';
import { Dashboard } from './pages/Dashboard';
import { Coupons } from './pages/Coupons';
import { GenerateCoupons } from './pages/GenerateCoupons';
import { FuelTypesManager } from './pages/FuelTypes';
import { Batches } from './pages/Batches';
import { BatchDetail } from './pages/BatchDetail';
import { Departments } from './pages/Departments';
import { Locations } from './pages/Locations';
import { RegisterAttendant } from './pages/RegisterAttendant';
import { Approvals } from './pages/Approvals';
import { Requisitions } from './pages/Requisitions';
import { RequisitionDetail } from './pages/RequisitionDetail';
import { Redemptions } from './pages/Redemptions';
import { RedemptionScan } from './pages/RedemptionScan';
import { RedemptionSummary } from './pages/RedemptionSummary';
import { ErpSales } from './pages/ErpSales';
import { AuditLog } from './pages/AuditLog';
import { Settings } from './pages/Settings';
import { AiAssistant } from './pages/AiAssistant';

// Guards the authenticated area. With the session already resolved in main.tsx, an unauthenticated
// visitor is sent back to the landing page, which offers the Keycloak sign-in redirect.
const RequireAuth: React.FC = () => {
  return isAuthenticated() ? <Layout /> : <Navigate to="/" replace />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/coupons/generate" element={<GenerateCoupons />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/attendants/register" element={<RegisterAttendant />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/requisitions/:id" element={<RequisitionDetail />} />
          <Route path="/redemptions" element={<Redemptions />} />
          <Route path="/redemptions/scan" element={<RedemptionScan />} />
          <Route path="/redemptions/summary" element={<RedemptionSummary />} />
          <Route path="/erp-sales" element={<ErpSales />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/fuel-types" element={<FuelTypesManager />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/ai" element={<AiAssistant />} />
          {/* Catch-all redirect to dashboard inside the layout */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
