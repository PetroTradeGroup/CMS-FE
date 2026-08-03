import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Department } from './departments';
import type { ApprovalRequest } from './approvals';

export interface FuelType {
  id: number;
  name: string;
  typeCode: string;
  description: string;
  active: boolean;
}

export interface Location {
  id: number;
  code: string;
  name: string;
}

export type CouponStatus =
  | 'GENERATED'
  | 'IN_STOCK'
  | 'IN_TRANSIT'
  | 'ALLOCATED'
  | 'REDEEMED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'FLAGGED';

export const COUPON_STATUSES: CouponStatus[] = [
  'GENERATED', 'IN_STOCK', 'IN_TRANSIT', 'ALLOCATED', 'REDEEMED', 'EXPIRED', 'CANCELLED', 'FLAGGED'
];

export type CouponType = 'PHYSICAL' | 'DIGITAL';

export interface Coupon {
  id: number;
  couponNumber: string;
  fuelType: FuelType;
  status: CouponStatus;
  denomination: number; // litres; 0 = legacy coupon with unknown denomination
  couponType: CouponType;
  expiryDate: string | null;
  location: Location | null;
  department: Department | null;
  batchNumber: string | null;
  batchSequence: number | null;
  createdAt: string;
}

export const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'IN_STOCK':
      return 'badge-success';
    case 'GENERATED':
    case 'IN_TRANSIT':
    case 'ALLOCATED':
    case 'REDEEMED':
      return 'badge-warning';
    default: // EXPIRED, CANCELLED, FLAGGED
      return 'badge-danger';
  }
};

// Coupons generated before the denomination release carry denomination 0 ("unknown")
export const formatDenomination = (denomination: number | null | undefined) =>
  denomination && denomination > 0 ? `${denomination} L` : '—';

export interface CouponFilters {
  dateFrom?: string;
  dateTo?: string;
  fuelTypeId?: string | number;
  status?: string;
  batchNumber?: string; // exact match, case-insensitive, whitespace-trimmed server-side
  batchId?: number; // for screens that already hold the internal ID (batch detail)
}

export interface GenerateCouponRequest {
  fuelTypeId: number;
  denomination: number; // litres, required
  locationId?: number;
  departmentId?: number;
  couponType?: CouponType;
  expiryDate?: string;
  performedBy?: string;
}

export interface DenominationLine {
  denomination: number;
  count: number;
}

export interface BulkGenerateRequest {
  fuelTypeId: number;
  targetQuantity: number; // total litres ordered
  lines: DenominationLine[]; // Σ (denomination × count) must equal targetQuantity
  locationId?: number;
  departmentId?: number;
  couponType?: CouponType;
  expiryDate?: string;
  performedBy?: string;
}

export const generateCoupon = (request: GenerateCouponRequest) => {
  return fetchApi<Coupon>('/coupons/generate', {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

export const generateBulkCoupons = (request: BulkGenerateRequest) => {
  return fetchApi<Coupon[]>('/coupons/generate/bulk', {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

// Legal targets per the backend state machine — used to narrow the transition dropdown
// when every selected coupon shares the same status. REDEEMED/EXPIRED/CANCELLED are terminal.
export const ALLOWED_TRANSITIONS: Record<CouponStatus, CouponStatus[]> = {
  GENERATED: ['IN_STOCK', 'CANCELLED', 'FLAGGED'],
  IN_STOCK: ['IN_TRANSIT', 'ALLOCATED', 'EXPIRED', 'CANCELLED', 'FLAGGED'],
  IN_TRANSIT: ['IN_STOCK', 'CANCELLED', 'FLAGGED'],
  ALLOCATED: ['REDEEMED', 'IN_STOCK', 'EXPIRED', 'CANCELLED', 'FLAGGED'],
  REDEEMED: [],
  EXPIRED: [],
  CANCELLED: [],
  FLAGGED: ['IN_STOCK', 'CANCELLED'],
};

export interface TransitionRequest {
  couponNumbers: string[];
  targetStatus: CouponStatus;
  toLocationId?: number; // setting this defers the whole call for supervisor approval (202)
  reason?: string; // required by the backend for CANCELLED/FLAGGED
  performedBy?: string;
}

export interface TransitionResult {
  count: number;
  targetStatus: CouponStatus;
}

// Returns 200 + TransitionResult when applied immediately, or 202 + ApprovalRequestResponse
// when deferred for approval — callers must branch on the returned status.
export const transitionCoupons = (request: TransitionRequest) => {
  return fetchApi<TransitionResult | ApprovalRequest>('/coupons/transitions', {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

export const getCoupons = (page = 0, size = 20, filters?: CouponFilters, sort?: string) => {
  let url = `/coupons?page=${page}&size=${size}`;
  if (filters) {
    if (filters.dateFrom) url += `&dateFrom=${filters.dateFrom}`;
    if (filters.dateTo) url += `&dateTo=${filters.dateTo}`;
    if (filters.fuelTypeId) url += `&fuelTypeId=${filters.fuelTypeId}`;
    if (filters.status) url += `&status=${filters.status}`;
    if (filters.batchNumber) url += `&batchNumber=${encodeURIComponent(filters.batchNumber.trim())}`;
    if (filters.batchId) url += `&batchId=${filters.batchId}`;
  }
  if (sort) url += `&sort=${encodeURIComponent(sort)}`; // bare "field,direction" value
  return fetchApi<PagedResponse<Coupon>>(url);
};

export const getCouponByNumber = (couponNumber: string) => {
  return fetchApi<Coupon>(`/coupons/${couponNumber}`);
};

export type MovementType =
  | 'GENERATION' | 'RECEIPT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ALLOCATION' | 'RETURN'
  | 'REDEMPTION' | 'EXPIRY' | 'CANCELLATION' | 'FLAG' | 'UNFLAG' | 'ADJUSTMENT' | 'REASSIGNMENT';

export interface CouponMovement {
  id: number;
  movementType: MovementType;
  fromStatus: CouponStatus | null;
  toStatus: CouponStatus | null;
  fromLocation: Location | null;
  toLocation: Location | null;
  performedBy: string | null;
  reason: string | null;
  batchNumber: string | null; // the coupon's own batch — same on every row
  referenceType: string | null;
  referenceId: number | null;
  createdAt: string;
}

// Oldest first. Coupons generated before the audit release have no GENERATION row.
export const getCouponHistory = (couponNumber: string) => {
  return fetchApi<CouponMovement[]>(`/coupons/${couponNumber}/history`);
};

export const getCouponsByFuelType = (fuelTypeId: number, page = 0, size = 20) => {
  return fetchApi<PagedResponse<Coupon>>(`/coupons/fuel-type/${fuelTypeId}?page=${page}&size=${size}`);
};
