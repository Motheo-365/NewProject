import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router';
import LoginPage from '../pages/login'; // Adjust path if needed

function RolePage({ role }: { role: 'ATC' | 'Passenger' }) {
  const navigate = useNavigate();
  const apiKey = localStorage.getItem('api_key');
  const userType = localStorage.getItem('user_type');
  const username = localStorage.getItem('username');

  if (!apiKey) return <Navigate to="/" replace />;
  if (userType !== role) {
    return <Navigate to={userType === 'ATC' ? '/atc' : '/passenger'} replace />;
  }

  function handleLogout() {
    localStorage.clear();
    navigate('/', { replace: true });
  }

  return (
    <main style={{ padding: '20px' }}>
      <h1>{role === 'ATC' ? 'ATC Dashboard' : 'Passenger Dashboard'}</h1>
      <p>Welcome, {username}.</p>
      <button type="button" onClick={handleLogout} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none' }}>
        Log out
      </button>
    </main>
  );
}

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/atc" element={<RolePage role="ATC" />} />
        <Route path="/passenger" element={<RolePage role="Passenger" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default Router;