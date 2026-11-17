import type { LoginResponse } from '../interfaces/api';
import { clearApiKey, getApiKeySession, setApiKey } from './apiKeyCookie';

export type UserRole = 'ATC' | 'Passenger';
export type SessionUser = Pick<LoginResponse, 'username'> & { type: UserRole };
export type DashboardPath = '/atc' | '/passenger';

export function getDashboardPath(role: string): DashboardPath | null {
  const normalizedRole = role.trim().toUpperCase();
  if (normalizedRole === 'ATC') return '/atc';
  if (normalizedRole === 'PASSENGER') return '/passenger';
  return null;
}

export function getCurrentUser(): SessionUser | null {
  const session = getApiKeySession();
  return session ? { username: session.username, type: session.type } : null;
}

export function saveCurrentUser(user: LoginResponse): void {
  const rolePath = getDashboardPath(user.type);
  if (!rolePath || !user.username || !user.api_key) {
    throw new Error('The login response does not contain a supported user account.');
  }

  const userType = rolePath === '/atc' ? 'ATC' : 'Passenger';
  setApiKey(user.api_key, user.username, userType);
}

export function clearCurrentUser(): void {
  clearApiKey();
}
