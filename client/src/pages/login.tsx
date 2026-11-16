import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import Loader from '../components/Loader';
import type { LoginResponse } from '../interfaces/api';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';

import '../styles/login.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Enter your email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address, such as name@example.com.');
      return;
    }

    if (!password) {
      setError('Enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiService.login(normalizedEmail, password);
      if (response.status !== 'success' || !response.data) {
        setError(response.message || 'The login service rejected your credentials.');
        return;
      }

      const user: LoginResponse = response.data;
      const normalizedRole = user.type.trim().toUpperCase();
      if (normalizedRole !== 'ATC' && normalizedRole !== 'PASSENGER') {
        setError(`Unsupported account type: ${user.type}`);
        return;
      }

      const userType = normalizedRole === 'ATC' ? 'ATC' : 'Passenger';
      socketService.disconnect();
      localStorage.setItem('api_key', user.api_key);
      localStorage.setItem('user_type', userType);
      localStorage.setItem('username', user.username);
      navigate(userType === 'ATC' ? '/atc' : '/passenger');
    } catch (loginError: unknown) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : 'An error occurred during login.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="login-eyebrow">FLIGHT TRACKING</p>
        <h1 id="login-title" className="login-title">Welcome back</h1>
        <p className="login-description">Sign in to continue to your dashboard.</p>

        {isLoading ? (
          <Loader message="Checking your details…" />
        ) : (
          <form className="login-form" onSubmit={handleLogin} noValidate>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-password-control">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder="Enter your password"
                required
              />
              <button
                className="login-password-toggle"
                type="button"
                aria-controls="login-password"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="login-submit" type="submit">
            Log in
          </button>
          </form>
        )}
      </section>
    </main>
  );
}