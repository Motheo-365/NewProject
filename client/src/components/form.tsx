import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import type { LoginResponse } from '../interfaces/api';
import { getDashboardPath, saveCurrentUser } from '../services/userSession';
import { apiService } from '../services/apiService';

interface LoginFormData {
  username: string;
  password: string;
}

function validateForm(formData: LoginFormData): string | null {
  if (!formData.username.trim()) {
    return 'Username is required.';
  }

  if (!formData.password) {
    return 'Password is required.';
  }

  return null;
}

function Form() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const validationError = validateForm(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.login(formData.username.trim(), formData.password);
      if (response.status !== 'success' || !response.data) {
        throw new Error(response.message || 'Login failed. Please check your credentials.');
      }

      const user: LoginResponse = response.data;
      const destination = getDashboardPath(user.type);
      if (!destination) {
        throw new Error(`Unsupported account type: ${user.type}`);
      }

      saveCurrentUser(user);
      navigate(destination, { replace: true });
    } catch (submitError: unknown) {
      console.error('Error submitting login form:', submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to connect to the server. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="form">
      <form onSubmit={handleSubmit}>
        <label htmlFor="auth-username">Username</label>
        <input
          id="auth-username"
          name="username"
          type="text"
          placeholder="Enter your username"
          autoComplete="username"
          value={formData.username}
          onChange={(event) => {
            setFormData({ ...formData, username: event.currentTarget.value });
            setError('');
          }}
          required
        />

        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          name="password"
          type="password"
          placeholder="Enter your password"
          autoComplete="current-password"
          value={formData.password}
          onChange={(event) => {
            setFormData({ ...formData, password: event.currentTarget.value });
            setError('');
          }}
          required
        />

        {error && <p className="form-error" role="alert">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}

export default Form;