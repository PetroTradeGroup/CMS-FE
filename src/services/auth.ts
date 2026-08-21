const KEYCLOAK_URL = 'http://localhost:8189';
const REALM = 'petrotrade';
const CLIENT_ID = 'coupon-backend';

const TOKEN_ENDPOINT = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

export const login = async (username: string, password: string): Promise<void> => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      username,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error('Invalid username or password');
  }

  const data: TokenResponse = await response.json();
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
};

// Keycloak refresh tokens are single-use (rotated on every refresh), so two 401s that land at
// the same time — e.g. StrictMode's double effect firing two requests off an expired access
// token — must not each start their own refresh: the second would present an already-invalidated
// token and fail, forcing a bogus logout even though the first refresh succeeded. Share one
// in-flight refresh across concurrent callers instead.
let refreshPromise: Promise<boolean> | null = null;

// Called by fetchApi on a 401 to silently retry once before forcing a re-login
export const refreshAccessToken = (): Promise<boolean> => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) return false;

      const data: TokenResponse = await response.json();
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const logout = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('username');
};

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);

export const isAuthenticated = (): boolean => !!getAccessToken();
