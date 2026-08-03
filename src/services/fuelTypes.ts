import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { FuelType } from './coupons';
export type { FuelType };

export interface FuelTypePayload {
  name: string;
  typeCode: string;
  description?: string;
}

export const createFuelType = (payload: FuelTypePayload) => {
  return fetchApi<FuelType>('/fuel-types', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

export const getFuelTypes = (page = 0, size = 20) => {
  return fetchApi<PagedResponse<FuelType>>(`/fuel-types?page=${page}&size=${size}`);
};

export const getActiveFuelTypes = (page = 0, size = 20) => {
  return fetchApi<PagedResponse<FuelType>>(`/fuel-types/active?page=${page}&size=${size}`);
};

export const getFuelTypeById = (id: number) => {
  return fetchApi<FuelType>(`/fuel-types/${id}`);
};

export const updateFuelType = (id: number, payload: FuelTypePayload) => {
  return fetchApi<FuelType>(`/fuel-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
};

export const activateFuelType = (id: number) => {
  return fetchApi<null>(`/fuel-types/${id}/activate`, {
    method: 'PATCH'
  });
};

export const deactivateFuelType = (id: number) => {
  return fetchApi<null>(`/fuel-types/${id}/deactivate`, {
    method: 'PATCH'
  });
};
