const SESSION_STORAGE_KEY = 'flight-tracking-session';
const SESSION_COOKIE = 'flight-tracking-session';
const LEGACY_API_KEY_COOKIE = 'flight-tracking-api-key';
const LEGACY_API_KEY_STORAGE_KEY = 'api_key';

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

function readSessionStorage(): ApiKeySession | null {
  const value = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (isApiKeySession(parsed)) return parsed;
  } catch {
    // Remove malformed session data below.
  }

  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  return null;
}

function writeSession(session: ApiKeySession): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function getApiKey(): string | null {
  return readSessionStorage()?.apiKey ?? null;
}

export function getApiKeySession(): ApiKeySession | null {
  return readSessionStorage();
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

  writeSession(session);
  if (getApiKey() !== session.apiKey) {
    clearApiKey();
    throw new Error('Unable to save the signed-in user API key in this browser tab.');
  }
}

export function clearApiKey(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function migrateLegacyApiKey(): void {
  if (!getApiKeySession()) {
    const username = localStorage.getItem('username');
    const type = localStorage.getItem('user_type');

    if (username && (type === 'ATC' || type === 'Passenger')) {
      const sessionCookie = readCookie(SESSION_COOKIE);
      if (sessionCookie) {
        try {
          const parsed: unknown = JSON.parse(decodeURIComponent(sessionCookie));
          if (
            isApiKeySession(parsed)
            && parsed.username === username
            && parsed.type === type
          ) {
            writeSession(parsed);
          }
        } catch {
          // A malformed legacy cookie is discarded after migration.
        }
      }

      if (!getApiKeySession()) {
        const legacyApiKey = localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY)
          ?? readCookie(LEGACY_API_KEY_COOKIE);
        if (legacyApiKey) {
          setApiKey(legacyApiKey, username, type);
        }
      }
    }
  }

  document.cookie = `${encodeURIComponent(SESSION_COOKIE)}=; ${getCookieAttributes(0)}`;
  document.cookie = `${encodeURIComponent(LEGACY_API_KEY_COOKIE)}=; ${getCookieAttributes(0)}`;
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
  localStorage.removeItem('username');
  localStorage.removeItem('user_type');
}
