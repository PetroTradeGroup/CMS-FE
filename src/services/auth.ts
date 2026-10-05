import { matchPath } from 'react-router-dom';
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

// Stocks sees redemptions across sites but doesn't redeem, so no /redemptions/scan.
const STOCKS_PAGES = ['/dashboard', '/coupons/*', '/batches/*', '/requisitions/*', '/redemptions', '/redemptions/summary'];

// Pages each restricted role may open (react-router patterns). A user gets the union over their
// roles. ADMIN, and any role not listed here, keep the full app. Drives both the route guard and
// the sidebar — the backend still enforces the data.
const ROLE_PAGES: Record<string, string[]> = {
  ATTENDANT: ['/redemptions/*'],
  TEAM_LEADER: ['/redemptions/*', '/attendants/register'],
  STOCKS_CONTROLLER: [...STOCKS_PAGES, '/approvals'],
  STOCKS_CLERK: STOCKS_PAGES,
  FINANCE: ['/dashboard', '/erp-sales'], // Dashboard without Recent Coupons (see Dashboard.tsx)
  // Cut-down Dashboard (see Dashboard.tsx), redemptions across all sites, and the Report page.
  REGIONAL_REP: ['/dashboard', '/redemptions', '/redemptions/summary', '/ai'],
};

export const canSee = (path: string): boolean => {
  if (hasRole('ADMIN')) return true;
  const roles = Object.keys(ROLE_PAGES).filter((role) => hasRole(role));
  return roles.length === 0 || roles.some((role) => ROLE_PAGES[role].some((p) => matchPath(p, path)));
};

// Where to land after login or after being bounced from a page the user can't open.
export const homePath = (): string => (canSee('/dashboard') ? '/dashboard' : '/redemptions');

// The Keycloak username (preferred_username claim) — the value the backend records as
// requestedBy / performedBy and scopes an Attendant's own view by.
export const getUsername = (): string | null =>
  (keycloak.tokenParsed?.preferred_username as string | undefined) ?? null;

// The station a retail caller (Attendant/Team Leader) is tied to, stamped on the token as the
// `locationCode` claim. Null for non-retail callers (Admin/Stocks), who aren't bound to one
// site — the backend lets them assert a site explicitly, everyone else is locked to this one.
// A Regional Rep spans every site, so any locationCode on their token is ignored.
export const getLocationCode = (): string | null =>
  hasRole('REGIONAL_REP') ? null : (keycloak.tokenParsed?.locationCode as string | undefined) ?? null;

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
