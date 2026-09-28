import { keycloak } from './keycloak';

// Auth is delegated to Keycloak via the Authorization Code + proof-key flow (see ./keycloak.ts).
// This module keeps the small, mostly-synchronous surface the rest of the app already consumes
// (getAccessToken / isAuthenticated / refreshAccessToken / logout).

// Redirects the browser to the Keycloak login page. Returns a never-resolving promise because
// the page navigates away.
export const login = (): Promise<void> =>
  keycloak.login({ redirectUri: `${window.location.origin}/dashboard` });

export const logout = (): Promise<void> => {
  localStorage.removeItem('username');
  return keycloak.logout({ redirectUri: `${window.location.origin}/` });
};

export const getAccessToken = (): string | null => keycloak.token ?? null;

export const isAuthenticated = (): boolean => !!keycloak.authenticated;

// True when the current token carries any of the given roles, as either a realm role or a
// client role on the coupon-backend client. Server-side checks are still authoritative — this
// only drives what the UI bothers to show.
export const hasRole = (...roles: string[]): boolean =>
  roles.some((role) => keycloak.hasRealmRole(role) || keycloak.hasResourceRole(role));

// The Keycloak username (preferred_username claim) — the value the backend records as
// requestedBy / performedBy and scopes an Attendant's own view by.
export const getUsername = (): string | null =>
  (keycloak.tokenParsed?.preferred_username as string | undefined) ?? null;

// The station a retail caller (Attendant/Team Leader) is tied to, stamped on the token as the
// `locationCode` claim. Null for non-retail callers (Admin/Stocks), who aren't bound to one
// site — the backend lets them assert a site explicitly, everyone else is locked to this one.
export const getLocationCode = (): string | null =>
  (keycloak.tokenParsed?.locationCode as string | undefined) ?? null;

// Called by fetchApi on a 401 to silently obtain a fresh access token before forcing a
// re-login. keycloak-js serializes concurrent updateToken() calls internally, so racing
// callers (e.g. StrictMode's double effect) share one refresh. Passing -1 forces a refresh
// regardless of the current token's remaining lifetime.
export const refreshAccessToken = async (): Promise<boolean> => {
  try {
    await keycloak.updateToken(-1);
    return !!keycloak.token;
  } catch {
    return false;
  }
};
