const API_KEY_COOKIE = 'flight-tracking-api-key';
const API_KEY_MAX_AGE_SECONDS = 24 * 60 * 60;
const LEGACY_API_KEY_STORAGE_KEY = 'api_key';
const LEGACY_USER_STORAGE_KEY = 'flight-tracking-user';

function getCookieAttributes(maxAge: number): string {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  return `Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function getApiKey(): string | null {
  const encodedCookieName = `${encodeURIComponent(API_KEY_COOKIE)}=`;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(encodedCookieName));

  if (!cookie) return null;

  try {
    const apiKey = decodeURIComponent(cookie.slice(encodedCookieName.length)).trim();
    return apiKey || null;
  } catch {
    clearApiKey();
    return null;
  }
}

export function setApiKey(apiKey: string): void {
  const normalizedApiKey = apiKey.trim();
  if (!normalizedApiKey) {
    throw new Error('Cannot save an empty API key.');
  }

  document.cookie = `${encodeURIComponent(API_KEY_COOKIE)}=${encodeURIComponent(normalizedApiKey)}; ${getCookieAttributes(API_KEY_MAX_AGE_SECONDS)}`;
  if (getApiKey() !== normalizedApiKey) {
    throw new Error('Unable to save the API key cookie in this browser.');
  }
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function clearApiKey(): void {
  document.cookie = `${encodeURIComponent(API_KEY_COOKIE)}=; ${getCookieAttributes(0)}`;
  localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
}

export function migrateLegacyApiKey(): void {
  const apiKey = localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY);
  if (apiKey && !getApiKey()) {
    setApiKey(apiKey);
  } else {
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
  }

  const storedUser = localStorage.getItem(LEGACY_USER_STORAGE_KEY);
  if (!storedUser) return;

  try {
    const user: unknown = JSON.parse(storedUser);
    if (typeof user !== 'object' || user === null || !('api_key' in user)) return;

    const { api_key: legacyApiKey, ...userProfile } = user;
    if (!getApiKey() && typeof legacyApiKey === 'string' && legacyApiKey.trim()) {
      setApiKey(legacyApiKey);
    }
    localStorage.setItem(LEGACY_USER_STORAGE_KEY, JSON.stringify(userProfile));
  } catch {
    localStorage.removeItem(LEGACY_USER_STORAGE_KEY);
  }
}
