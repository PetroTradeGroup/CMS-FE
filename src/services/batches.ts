import { fetchApi, API_BASE_URL } from './api';
import type { PagedResponse } from './api';
import type { FuelType, Location, CouponType, CouponStatus, DenominationLine } from './coupons';
import type { ApprovalRequest } from './approvals';

export interface CouponBatch {
  id: number;
  batchNumber: string;
  fuelType: FuelType;
  couponType: CouponType;
  quantity: number; // coupon unit count
  targetQuantity: number; // litres ordered; backfilled (unreliable) for legacy batches
  originLocation: Location | null;
  expiryDate: string | null;
  createdBy: string | null;
  createdAt: string;
  statusCounts: Partial<Record<CouponStatus, number>> | null; // only populated on GET /batches/{id}
}

export interface BatchFilters {
  fuelTypeId?: string | number;
  couponType?: string;
  locationId?: string | number;
  dateFrom?: string;
  dateTo?: string;
  hasStock?: boolean; // opt-in — true restricts to batches with at least one IN_STOCK coupon
}

const batchFilterQuery = (filters?: BatchFilters) => {
  let query = '';
  if (filters) {
    if (filters.fuelTypeId) query += `&fuelTypeId=${filters.fuelTypeId}`;
    if (filters.couponType) query += `&couponType=${filters.couponType}`;
    if (filters.locationId) query += `&locationId=${filters.locationId}`;
    if (filters.dateFrom) query += `&dateFrom=${filters.dateFrom}`;
    if (filters.dateTo) query += `&dateTo=${filters.dateTo}`;
    if (filters.hasStock) query += `&hasStock=true`;
  }
  return query;
};

export const getBatches = (page = 0, size = 20, filters?: BatchFilters) => {
  return fetchApi<PagedResponse<CouponBatch>>(`/batches?page=${page}&size=${size}${batchFilterQuery(filters)}`);
};

export const getBatch = (id: number) => {
  return fetchApi<CouponBatch>(`/batches/${id}`);
};

// Moves all GENERATED coupons in the batch to IN_STOCK; locationId defaults to the batch origin
export const receiveBatch = (id: number, performedBy?: string, locationId?: number) => {
  return fetchApi<CouponBatch>(`/batches/${id}/receive`, {
    method: 'POST',
    body: JSON.stringify({
      locationId: locationId ?? null,
      ...(performedBy ? { performedBy } : {})
    })
  });
};

export interface TransferRequest {
  batchId: number;
  // Coupons are selected one of three mutually-exclusive ways — omit all of these for the whole batch:
  rangeStart?: number; // 1-indexed batch positions, both-or-neither
  rangeEnd?: number;
  denominationLines?: DenominationLine[]; // for each line, the first `count` eligible coupons of that
  // denomination (batch order) — one call can mix denominations, e.g. 5×20L + 3×50L
  toLocationId?: number; // setting location and/or department defers the call for approval (202)
  toDepartmentId?: number;
  targetStatus?: CouponStatus; // omit for a pure reassignment — only IN_STOCK coupons are eligible;
  // anything else (ALLOCATED, REDEEMED, even IN_TRANSIT — mid-transfer, must be received back first) is rejected
  reason?: string;
  performedBy?: string;
}

// One coupon actually moved by a transfer — its position in the batch and its denomination
export interface TransferredCoupon {
  couponNumber: string;
  batchSequence: number | null;
  denomination: number;
}

export interface TransferResult {
  count: number;
  batchId: number;
  batchNumber: string | null;
  rangeStart: number | null;
  rangeEnd: number | null;
  denominationLines: DenominationLine[] | null;
  coupons: TransferredCoupon[] | null;
  targetStatus: CouponStatus | null;
}

// 200 + TransferResult when applied immediately (status-only), 202 + ApprovalRequestResponse
// when a location/department change defers it — callers must branch on the returned status.
export const transferCoupons = (request: TransferRequest) => {
  return fetchApi<TransferResult | ApprovalRequest>('/coupons/transfers', {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

// Binary/stream downloads — bypass fetchApi's JSON envelope and trigger a browser download
const downloadBatchFile = async (path: string, fallbackFilename: string, errorLabel: string) => {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    let message = errorLabel;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch { /* non-JSON error body */ }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition');
  const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] || fallbackFilename;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
};

// ZIP of one QR PNG per coupon (legacy print handoff)
export const downloadBatchQrCodes = (id: number, batchNumber: string) =>
  downloadBatchFile(`/batches/${id}/qrcodes`, `${batchNumber}-qrcodes.zip`, 'Failed to download QR codes');

// Variable-data-printing CSV — one row per coupon incl. the signed qr_payload column;
// the preferred handoff for print vendors (their VDP software renders the QR from the text)
export const downloadBatchPrintCsv = (id: number, batchNumber: string) =>
  downloadBatchFile(`/batches/${id}/print-csv`, `${batchNumber}-print.csv`, 'Failed to download print CSV');

// Batch register export (one row per batch, full filtered result, newest first).
// For the coupons inside a single batch use GET /coupons/export?batchNumber=... instead.
export const exportBatches = (format: 'excel' | 'pdf', filters?: BatchFilters) => {
  const query = batchFilterQuery(filters).replace(/^&/, '');
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  return downloadBatchFile(
    `/batches/export/${format}${query ? `?${query}` : ''}`,
    `batches-export.${ext}`,
    `Failed to export batches as ${format === 'excel' ? 'Excel' : 'PDF'}`
  );
};
