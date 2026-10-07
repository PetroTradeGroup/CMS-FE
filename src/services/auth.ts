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
// Client roles are read from every client on the token, not just VITE_KEYCLOAK_CLIENT_ID — a
// build with a different client id would otherwise miss roles assigned on coupon-backend.
export const hasRole = (...roles: string[]): boolean => {
  const clientRoles = Object.values(keycloak.tokenParsed?.resource_access ?? {}).flatMap((c) => c.roles ?? []);
  return roles.some((role) => keycloak.hasRealmRole(role) || clientRoles.includes(role));
};

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
  // Raises requisitions and tracks them on SalesDashboard.tsx; Fuel Types is view-only for them.
  SALES_CLERK: ['/dashboard', '/requisitions/*', '/fuel-types'],
  // Receiving side of a requisition: confirms receipt of In Transit coupons on Approvals.
  COMMERCIAL_MANAGER: ['/approvals'],
};

// Only a Commercial Manager may confirm receipt on a requisition's transfer (backend: 403 otherwise).
export const isCommercialManager = (): boolean => hasRole('COMMERCIAL_MANAGER');

// Sales Clerk only raises requisitions — no fulfil/reject, no fuel type edits.
export const isSalesClerk = (): boolean => hasRole('SALES_CLERK') && !hasRole('ADMIN');

export const canSee = (path: string): boolean => {
  if (hasRole('ADMIN')) return true;
  const roles = Object.keys(ROLE_PAGES).filter((role) => hasRole(role));
  return roles.length === 0 || roles.some((role) => ROLE_PAGES[role].some((p) => matchPath(p, path)));
};

// Where to land after login or after being bounced from a page the user can't open.
export const homePath = (): string => ['/dashboard', '/approvals'].find(canSee) ?? '/redemptions';

// The Keycloak username (preferred_username claim) — the value the backend records as
// requestedBy / performedBy and scopes an Attendant's own view by.
export const getUsername = (): string | null =>
  (keycloak.tokenParsed?.preferred_username as string | undefined) ?? null;

// The caller's department code (the `department` claim). The backend raises a requisition for
// this department, so the form only asks for one when it's missing (e.g. an Admin).
export const getDepartmentCode = (): string | null =>
  (keycloak.tokenParsed?.department as string | undefined) ?? null;

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
