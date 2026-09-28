import Keycloak from 'keycloak-js';

// The frontend authenticates against Keycloak using the Authorization Code flow with proof key
// for code exchange (S256). `coupon-backend` must be configured as a *public* client with
// Standard Flow enabled and Web Origins / redirect URIs covering this app's origin.
//
// IMPORTANT: this URL must match the hostname Keycloak advertises as its frontend URL. If
// Keycloak thinks it lives at http://10.10.2.248:8189 but we start the flow at
// http://localhost:8189, the login form posts back to a different host than the one that set
// the auth-session cookie, and Keycloak fails with "Restart login cookie not found".
const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://192.168.0.242:8189';
const REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'petrotrade';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'coupon-backend';

export const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: REALM,
  clientId: CLIENT_ID,
});

// Mirrors the token's preferred_username into localStorage so the audit "performed by" fields
// across the app can keep defaulting from it without each page reaching into the token.
const syncUsername = () => {
  const username = keycloak.tokenParsed?.preferred_username;
  if (username) localStorage.setItem('username', username);
};
keycloak.onAuthSuccess = syncUsername;
keycloak.onAuthRefreshSuccess = syncUsername;
keycloak.onTokenExpired = () => {
  keycloak.updateToken(30).catch(() => keycloak.login());
};

let initPromise: Promise<boolean> | null = null;

// Called once before the app renders. `check-sso` performs a silent, iframe-based check for an
// existing Keycloak session (no redirect); the user only gets bounced to the login page when
// they explicitly click "Sign In" or hit a guarded route with no session.
export const initKeycloak = (): Promise<boolean> => {
  if (initPromise) return initPromise;

  initPromise = keycloak
    .init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      pkceMethod: 'S256',
      checkLoginIframe: false,
    })
    .then((authenticated) => {
      if (authenticated) syncUsername();
      return authenticated;
    })
    .catch(() => false);

  return initPromise;
};
