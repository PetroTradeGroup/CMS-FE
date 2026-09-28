import { fetchApi } from './api';

// POST /api/v1/attendants — a Team Leader (or Admin) provisions an ATTENDANT account for a
// station. The role is fixed server-side; the caller cannot choose it. See the backend
// hand-off doc for the full contract (AttendantController.java / KeycloakAdminClient.java).

export interface RegisterAttendantRequest {
  username: string;   // max 50, unique (409 on duplicate)
  email: string;      // valid email address
  firstName: string;  // max 50
  lastName: string;   // max 50
  // Optional. Omit for the normal case — the server defaults it to the caller's own station.
  // Only send it to register at a *different* station. If supplied it must match an existing
  // station (404 otherwise). A caller with no station of their own (Admin) that omits it gets
  // a 400.
  locationCode?: string; // max 10
}

export type AttendantSyncStatus = 'SYNCED' | 'PENDING' | 'FAILED';

export interface RegisteredAttendant {
  id: number;
  // Null until Keycloak provisioning succeeds — happens immediately (SYNCED) or, if Keycloak
  // was unreachable at creation time, later via a background retry (PENDING/FAILED until then).
  keycloakUserId: string | null;
  username: string;
  email: string;
  locationCode: string;
  syncStatus: AttendantSyncStatus;
  // Present only when syncStatus is SYNCED. Returned exactly once — never retrievable again as
  // the same value. Keycloak flags it as temporary, so the attendant must set their own on
  // first login.
  temporaryPassword: string | null;
}

export const registerAttendant = (body: RegisterAttendantRequest) => {
  // 201 => provisioned now (SYNCED, temporaryPassword set). 202 => queued (PENDING/FAILED,
  // temporaryPassword null) because Keycloak was unreachable; call resetTempPassword once
  // synced to get a usable password.
  return fetchApi<RegisteredAttendant>('/attendants', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

// POST /api/v1/attendants/{id}/reset-temp-password — issues a fresh temporary password.
// For an attendant still PENDING/FAILED sync this 409s until Keycloak provisioning catches up;
// there's no separate status endpoint yet, so this doubles as the "is it synced?" check.
export const resetTempPassword = (id: number) => {
  return fetchApi<RegisteredAttendant>(`/attendants/${id}/reset-temp-password`, {
    method: 'POST',
  });
};
