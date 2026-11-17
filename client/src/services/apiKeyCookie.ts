const SESSION_COOKIE = 'flight-tracking-session';
const LEGACY_API_KEY_COOKIE = 'flight-tracking-api-key';
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const LEGACY_API_KEY_STORAGE_KEY = 'api_key';
const LEGACY_USER_STORAGE_KEY = 'flight-tracking-user';

interface ApiKeySession {
  apiKey: string;
  username: string;
  type: 'ATC' | 'Passenger';
}

function getCookieAttributes(maxAge: number): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  return `Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function readCookie(name: string): string | null {
  const encodedCookieName = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(encodedCookieName));

  return cookie ? cookie.slice(encodedCookieName.length) : null;
}

function isApiKeySession(value: unknown): value is ApiKeySession {
  if (typeof value !== 'object' || value === null) return false;

  const session = value as Record<string, unknown>;
  return typeof session.apiKey === 'string'
    && Boolean(session.apiKey.trim())
    && typeof session.username === 'string'
    && Boolean(session.username.trim())
    && (session.type === 'ATC' || session.type === 'Passenger');
}

export function getApiKey(): string | null {
  const cookie = readCookie(SESSION_COOKIE);
  if (!cookie) return null;

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(cookie));
    if (!isApiKeySession(parsed)) {
      clearApiKey();
      return null;
    }

    const username = localStorage.getItem('username');
    const type = localStorage.getItem('user_type');
    if (parsed.username !== username || parsed.type !== type) {
      clearApiKey();
      return null;
    }

    return parsed.apiKey;
  } catch {
    clearApiKey();
    return null;
  }
}

export function setApiKey(
  apiKey: string,
  username: string,
  type: 'ATC' | 'Passenger',
): void {
  const session: ApiKeySession = {
    apiKey: apiKey.trim(),
    username: username.trim(),
    type,
  };
  if (!session.apiKey || !session.username) {
    throw new Error('Cannot save an API key without a valid user identity.');
  }

  localStorage.setItem('username', session.username);
  localStorage.setItem('user_type', session.type);
  const value = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${encodeURIComponent(SESSION_COOKIE)}=${value}; ${getCookieAttributes(SESSION_MAX_AGE_SECONDS)}`;

  if (getApiKey() !== session.apiKey) {
    clearApiKey();
    throw new Error('Unable to save the signed-in user API key in this browser.');
  }

  document.cookie = `${encodeURIComponent(LEGACY_API_KEY_COOKIE)}=; ${getCookieAttributes(0)}`;
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function clearApiKey(): void {
  document.cookie = `${encodeURIComponent(SESSION_COOKIE)}=; ${getCookieAttributes(0)}`;
  document.cookie = `${encodeURIComponent(LEGACY_API_KEY_COOKIE)}=; ${getCookieAttributes(0)}`;
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function migrateLegacyApiKey(): void {
  const legacySession = localStorage.getItem(LEGACY_USER_STORAGE_KEY);
  if (legacySession) {
    try {
      const parsed: unknown = JSON.parse(legacySession);
      if (typeof parsed === 'object' && parsed !== null && 'api_key' in parsed) {
        const userProfile = Object.fromEntries(
          Object.entries(parsed).filter(([key]) => key !== 'api_key'),
        );
        localStorage.setItem(LEGACY_USER_STORAGE_KEY, JSON.stringify(userProfile));
      }
    } catch {
      localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
    }
  }

  const legacyApiKey = localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY);
  if (legacyApiKey || readCookie(LEGACY_API_KEY_COOKIE)) {
    clearApiKey();
    localStorage.removeItem('username');
    localStorage.removeItem('user_type');
  }

  if (readCookie(SESSION_COOKIE) && !getApiKey()) {
    clearApiKey();
    localStorage.removeItem('username');
    localStorage.removeItem('user_type');
  }
}
