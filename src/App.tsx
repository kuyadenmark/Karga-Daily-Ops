/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Attendance } from './pages/Attendance';
import { CashAdvance } from './pages/CashAdvance';
import { Payroll } from './pages/Payroll';
import { Projects } from './pages/Projects';
import { Billing } from './pages/Billing';
import { Inventory } from './pages/Inventory';
import { Holidays } from './pages/Holidays';
import { Admin } from './pages/Admin';
import { hasSupabaseConfig } from './lib/supabase';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="cash-advance" element={<CashAdvance />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="projects" element={<Projects />} />
          <Route path="billing" element={<Billing />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="holidays" element={<Holidays />} />
          <Route path="admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
