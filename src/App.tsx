import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Coupons } from './pages/Coupons';
import { GenerateCoupons } from './pages/GenerateCoupons';
import { FuelTypesManager } from './pages/FuelTypes';
import { Batches } from './pages/Batches';
import { BatchDetail } from './pages/BatchDetail';
import { Departments } from './pages/Departments';
import { Approvals } from './pages/Approvals';
import { Requisitions } from './pages/Requisitions';
import { RequisitionDetail } from './pages/RequisitionDetail';
import { Settings } from './pages/Settings';
import { AiAssistant } from './pages/AiAssistant';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/coupons/generate" element={<GenerateCoupons />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/departments" element={<Departments />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/requisitions/:id" element={<RequisitionDetail />} />
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
