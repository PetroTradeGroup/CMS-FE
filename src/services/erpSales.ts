import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { LocationType } from './locations';

// RECEIVED is transient — resolves synchronously within the same inbound call, so it's never
// actually observed at rest. Sale-level status is now a roll-up of the lines:
//   ASSIGNED            — every line filled
//   PARTIALLY_ASSIGNED  — some lines filled, some FAILED
//   FAILED              — no line could be filled
//   PUSHED              — BC has confirmed the assigned lines (may still carry a FAILED line)
export type SaleStatus = 'RECEIVED' | 'ASSIGNED' | 'PARTIALLY_ASSIGNED' | 'PUSHED' | 'FAILED';

// A line is all-or-nothing: either the full requestedCount was assigned or the line FAILED with
// an empty couponNumbers. Restock is driven off this, not the sale status.
export type SaleLineStatus = 'ASSIGNED' | 'FAILED';

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

export interface SaleLine {
  id: number;
  lineNumber: number;
  fuelType: SaleFuelType;
  denomination: number;
  requestedCount: number;
  wholeBooks: boolean;
  status: SaleLineStatus;
  failureReason: string | null; // set on FAILED — e.g. "Only 3 of 10 requested 50.00 coupon(s) available at SITE-A"
  couponNumbers: string[]; // serials assigned against this line — can be 50+, keep out of table rows
}

export interface CouponSale {
  id: number;
  bcDocumentNumber: string; // Business Central's document number — the key support/ops use, not `id`
  location: SaleLocation;
  status: SaleStatus;
  customerReference: string | null; // opaque, whatever BC sent
  receivedAt: string;
  assignedAt: string | null;
  pushedAt: string | null;
  lines: SaleLine[];
}

// True when any line still needs a restock + BC resend. Note a PUSHED sale can still be true here.
export const saleNeedsRestock = (sale: CouponSale) =>
  (sale.lines || []).some(line => line.status === 'FAILED');

export const saleRequestedTotal = (sale: CouponSale) =>
  (sale.lines || []).reduce((sum, line) => sum + line.requestedCount, 0);

// "20.00 ×2, 50.00" style roll-up of the fuel/denom mix for a list row.
export const saleLineSummary = (sale: CouponSale) => {
  const lines = sale.lines || [];
  if (lines.length === 0) return '—';
  const parts = lines.map(l => {
    const fuel = l.fuelType?.typeCode || l.fuelType?.name || '?';
    return `${fuel} ${l.denomination}`;
  });
  return parts.join(', ');
};

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
