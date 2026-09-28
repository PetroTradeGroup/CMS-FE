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

// Raw paginated access, for a UI that wants real server-side paging.
export const getLocationsPage = (page = 0, size = 20, sort = 'name,asc', active?: boolean) => {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (active !== undefined) params.set('active', String(active));
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
}

export const updateLocation = (id: number, body: UpdateLocationBody) => {
  return fetchApi<LocationDetail>(`/locations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
};
