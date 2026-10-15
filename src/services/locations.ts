import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Location } from './coupons';

export type LocationType = 'HQ' | 'DEPOT' | 'RETAIL_SITE';

export const LOCATION_TYPES: LocationType[] = ['HQ', 'DEPOT', 'RETAIL_SITE'];

export const LOCATION_TYPE_LABEL: Record<LocationType, string> = {
  HQ: 'Head Office',
  DEPOT: 'Depot',
  RETAIL_SITE: 'Retail Site',
};

export interface LocationDetail extends Location {
  type: LocationType;
  address: string | null;
  companyId: number | null; // the company running this site (never null server-side)
  companyCode: string | null;
  companyName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// GET /api/v1/locations is paginated (ApiResponse<PagedResponse<LocationResponse>>, Spring
// page/size/sort, default size 20). The only content filter is `active` (omit for all).
//
// Callers here want the whole set for a dropdown / client-side table, so we ask for one large
// page and hand back just the array — keeping the historical `{ ..., data: LocationDetail[] }`
// shape every consumer already expects.
export const getLocations = async (active?: boolean) => {
  const params = new URLSearchParams({ page: '0', size: '1000', sort: 'name,asc' });
  if (active !== undefined) params.set('active', String(active));
  const res = await fetchApi<PagedResponse<LocationDetail>>(`/locations?${params.toString()}`);
  return { ...res, data: res.data?.content ?? [] };
};

// Server-side paged + filtered access. `q` matches code or name (case-insensitive); unset filters are omitted.
export interface LocationPageFilters {
  active?: boolean;
  type?: LocationType;
  companyId?: number;
  q?: string;
}

export const getLocationsPage = (page = 0, size = 20, sort = 'name,asc', filters: LocationPageFilters = {}) => {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (filters.active !== undefined) params.set('active', String(filters.active));
  if (filters.type) params.set('type', filters.type);
  if (filters.companyId != null) params.set('companyId', String(filters.companyId));
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  return fetchApi<PagedResponse<LocationDetail>>(`/locations?${params.toString()}`);
};

export const getLocation = (id: number) => {
  return fetchApi<LocationDetail>(`/locations/${id}`);
};

// POST /api/v1/locations — ADMIN only. A duplicate code *or* name comes back as 400 with the
// message "Location code/name '…' already exists".
export interface CreateLocationBody {
  code: string;   // max 10
  name: string;   // max 100
  type: LocationType;
  address?: string | null; // max 255, optional
  companyId?: number | null; // omitted → Petrotrade
}

export const createLocation = (body: CreateLocationBody) => {
  return fetchApi<LocationDetail>('/locations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

// PUT /api/v1/locations/{id} — ADMIN only. All four fields are sent every time; `active` is
// required by the backend. Locations are never deleted — deactivate via active: false. Code
// is immutable (not part of the update payload).
export interface UpdateLocationBody {
  name: string;
  type: LocationType;
  address: string | null;
  active: boolean;
  companyId?: number | null; // omitted → keeps the current company
}

export const updateLocation = (id: number, body: UpdateLocationBody) => {
  return fetchApi<LocationDetail>(`/locations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
};

// PUT /api/v1/locations/{id}/company — ADMIN or REGIONAL_REP. Its redemptions report under
// that company from then on.
export const assignLocationCompany = (id: number, companyId: number) => {
  return fetchApi<LocationDetail>(`/locations/${id}/company`, {
    method: 'PUT',
    body: JSON.stringify({ companyId }),
  });
};
