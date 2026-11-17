import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import LoginPage from '../pages/login';
import AtcPage from '../pages/atc';
import Passenger from '../pages/passenger';
import { getApiKey } from '../services/apiKeyCookie';
import { getCurrentUser } from '../services/userSession';

function RolePage({ role, children }: { role: 'ATC' | 'Passenger'; children?: ReactNode }) {
  const apiKey = getApiKey();
  const userType = getCurrentUser()?.type;

  if (!apiKey || (userType !== 'ATC' && userType !== 'Passenger')) {
    return <Navigate to="/" replace />;
  }

  if (userType !== role) {
    return <Navigate to={userType === 'ATC' ? '/atc' : '/passenger'} replace />;
  }

  return <>{children}</>;
}

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/atc" element={<RolePage role="ATC"><AtcPage /></RolePage>} />
        <Route
          path="/passenger"
          element={(
            <RolePage role="Passenger">
              <Passenger />
            </RolePage>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default Router;