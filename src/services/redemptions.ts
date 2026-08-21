import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Coupon, FuelType, Location, CouponStatus, DenominationLine } from './coupons';
import type { Department } from './departments';
import type { TransferredCoupon } from './batches';

// Always PENDING on submit (202). post() flips it straight to POSTED — there is no separate
// approve step and no reject path for a redemption the way there is for an ApprovalRequest.
export type RedemptionStatus = 'PENDING' | 'POSTED';

export interface RedemptionRequest {
  id: number;
  requestType: 'REDEMPTION';
  count: number;
  denominations: DenominationLine[];
  batchSequences: number[]; // scanned/typed coupons can span multiple batches, unlike a TRANSFER
  couponNumbers: string[];
  batchNumber: null;
  rangeStart: null;
  rangeEnd: null;
  targetStatus: CouponStatus; // always REDEEMED
  toLocation: Location; // the asserted site — not a move destination
  toDepartment: Department | null;
  reason: string | null;
  requestedBy: string;
  requestedAt: string;
  status: RedemptionStatus;
  decidedBy: string | null; // set to the poster on post()
  decidedAt: string | null;
  decisionReason: string | null;
  receivedBy: string | null;
  receivedAt: string | null;
  requisitionId: number | null;
  documentNumber: string | null; // set by post()
  transferredCoupons: TransferredCoupon[];
}

export interface SubmitRedemptionRequest {
  scannedPayloads?: string[]; // raw scanned QR strings, sent as-is — not decoded/parsed client-side
  couponNumbers?: string[]; // typed manually
  locationId: number; // asserted site
  reason?: string;
  performedBy: string;
}

// Always 202 Accepted + PENDING — a redemption never applies immediately. The backend then
// auto-posts to the ERP in the background (mock mode generates MOCK-... document numbers; retries
// every 5 min on failure) — poll getRedemption(id) for POSTED rather than assuming post() is needed.
export const submitRedemption = (request: SubmitRedemptionRequest) => {
  return fetchApi<RedemptionRequest>('/redemptions', {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

export interface ScanVerifyResult {
  coupon: Coupon;
  redeemable: boolean;
  reason: string | null; // why it isn't redeemable, e.g. wrong status, already redeemed
}

// Read-only — verifies a single scanned QR payload without submitting anything. Lets the scan
// screen give per-coupon feedback before the attendant commits the batch.
export const verifyRedemptionScan = (scannedPayload: string) => {
  return fetchApi<ScanVerifyResult>('/redemptions/scan', {
    method: 'POST',
    body: JSON.stringify({ scannedPayload })
  });
};

export interface RedemptionFuelTypeSummary {
  fuelType: FuelType;
  count: number;
  litres: number;
  denominations: DenominationLine[];
}

export interface RedemptionSummary {
  date: string;
  totalCount: number;
  totalLitres: number;
  byFuelType: RedemptionFuelTypeSummary[];
}

// A day's redemptions — totals plus a per-fuel-type breakdown. locationId narrows to one site.
export const getRedemptionSummary = (date: string, locationId?: number) => {
  let url = `/redemptions/summary?date=${date}`;
  if (locationId) url += `&locationId=${locationId}`;
  return fetchApi<RedemptionSummary>(url);
};

export interface PostRedemptionRequest {
  documentNumber: string; // ERP document number
  performedBy: string;
}

// Re-validates and flips the coupons ALLOCATED → REDEEMED. Only valid while PENDING.
export const postRedemption = (id: number, request: PostRedemptionRequest) => {
  return fetchApi<RedemptionRequest>(`/redemptions/${id}/post`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

export const getRedemptions = (page = 0, size = 20, status?: RedemptionStatus) => {
  let url = `/redemptions?page=${page}&size=${size}`;
  if (status) url += `&status=${status}`;
  return fetchApi<PagedResponse<RedemptionRequest>>(url);
};

export const getRedemption = (id: number) => {
  return fetchApi<RedemptionRequest>(`/redemptions/${id}`);
};
