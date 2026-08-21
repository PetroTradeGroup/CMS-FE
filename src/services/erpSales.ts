import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { LocationType } from './locations';

// RECEIVED is transient — resolves to ASSIGNED or FAILED synchronously within the same inbound
// call, so it's never actually observed at rest. PUSHED/FAILED are terminal.
export type SaleStatus = 'RECEIVED' | 'ASSIGNED' | 'PUSHED' | 'FAILED';

export interface SaleLocation {
  id: number;
  code: string;
  name: string;
  type: LocationType;
  active: boolean;
}

export interface SaleFuelType {
  id: number;
  name: string;
  typeCode: string;
  active: boolean;
}

export interface CouponSale {
  id: number;
  bcDocumentNumber: string; // Business Central's document number — the key support/ops use, not `id`
  location: SaleLocation;
  fuelType: SaleFuelType;
  denomination: number;
  requestedCount: number;
  status: SaleStatus;
  couponNumbers: string[]; // serials assigned against this sale — can be 50+, keep out of table rows
  customerReference: string | null; // opaque, whatever BC sent
  failureReason: string | null; // set on FAILED — e.g. "Only 12 of 50 requested 20.00 coupon(s) available at SITE-A"
  receivedAt: string;
  assignedAt: string | null;
  pushedAt: string | null;
}

// Read-only — sales only ever originate from Business Central, nothing here is submitted by the
// dashboard. Defaults to newest first (receivedAt desc); pass sort to override (e.g. "status").
export const getSales = (page = 0, size = 20, status?: SaleStatus, sort?: string) => {
  let url = `/erp/sales?page=${page}&size=${size}`;
  if (status) url += `&status=${status}`;
  if (sort) url += `&sort=${encodeURIComponent(sort)}`;
  return fetchApi<PagedResponse<CouponSale>>(url);
};

// Keyed by BC's own document number, not the CMS's internal id — 404 if never received.
export const getSale = (documentNumber: string) => {
  return fetchApi<CouponSale>(`/erp/sales/${encodeURIComponent(documentNumber)}`);
};
