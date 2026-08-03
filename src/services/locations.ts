import { fetchApi } from './api';
import type { Location } from './coupons';

export type LocationType = 'HQ' | 'DEPOT' | 'RETAIL_SITE';

export interface LocationDetail extends Location {
  type: LocationType;
  address: string | null;
  active: boolean;
}

// Unpaged list — intended for dropdowns
export const getLocations = (activeOnly = true) => {
  return fetchApi<LocationDetail[]>(`/locations${activeOnly ? '?active=true' : ''}`);
};

export const getLocation = (id: number) => {
  return fetchApi<LocationDetail>(`/locations/${id}`);
};
