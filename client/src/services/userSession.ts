import type { LoginResponse } from '../interfaces/api';

const SESSION_STORAGE_KEY = 'flight-tracking-user';

export type UserRole = 'ATC' | 'Passenger';
export type SessionUser = Omit<LoginResponse, 'type'> & { type: UserRole };
export type DashboardPath = '/atc' | '/passenger';

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== 'object' || value === null) return false;

  const user = value as Record<string, unknown>;
  return typeof user.username === 'string'
    && typeof user.api_key === 'string'
    && (user.type === 'ATC' || user.type === 'Passenger');
}

export function getDashboardPath(role: string): DashboardPath | null {
  if (role === 'ATC') return '/atc';
  if (role === 'Passenger') return '/passenger';
  return null;
}

export function getCurrentUser(): SessionUser | null {
  const storedUser = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!storedUser) return null;

  try {
    const user: unknown = JSON.parse(storedUser);
    return isSessionUser(user) ? user : null;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveCurrentUser(user: LoginResponse): void {
  const rolePath = getDashboardPath(user.type);
  if (!rolePath || !user.username || !user.api_key) {
    throw new Error('The login response does not contain a supported user account.');
  }

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

export function clearCurrentUser(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}
