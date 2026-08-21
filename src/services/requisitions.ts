import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Location, CouponStatus, FuelType } from './coupons';
import type { Department } from './departments';
import type { TransferResult } from './batches';
import type { ApprovalRequest } from './approvals';

// PENDING → (PARTIALLY_FULFILLED)* → FULFILLED, or REJECTED from PENDING or PARTIALLY_FULFILLED.
// PARTIALLY_FULFILLED means at least one delivery has been received but at least one line still
// has litres outstanding — fulfill (against this or another batch) and reject both remain callable.
export type RequisitionStatus = 'PENDING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'REJECTED';

export interface RequisitionLine {
  fuelType: FuelType;
  denomination: number;
  requestedLitres: number;
  fulfilledLitres: number;
  outstandingLitres: number;
  requestedBooks: number;
  fulfilledBooks: number;
  outstandingBooks: number;
}

export interface Requisition {
  id: number;
  department: Department;
  location: Location;
  lines: RequisitionLine[];
  requestedBy: string;
  requestedAt: string;
  status: RequisitionStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

export interface RequisitionLineRequest {
  fuelTypeId: number;
  denomination: number;
  books?: number; // preferred; on creation must be a whole-book multiple if litres is used instead
  litres?: number; // fulfill doesn't force this to a book multiple, so odd legacy balances can drain
}

export interface CreateRequisitionRequest {
  departmentId: number;
  locationId: number;
  requestedBy: string;
  lines: RequisitionLineRequest[]; // books (preferred) or litres per (fuel type, denomination) — no two lines may repeat the same pair
}

export const createRequisition = (request: CreateRequisitionRequest) => {
  return fetchApi<Requisition>('/requisitions', {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

export const getRequisitions = (page = 0, size = 20, status?: RequisitionStatus) => {
  let url = `/requisitions?page=${page}&size=${size}`;
  if (status) url += `&status=${status}`;
  return fetchApi<PagedResponse<Requisition>>(url);
};

export const getRequisition = (id: number) => {
  return fetchApi<Requisition>(`/requisitions/${id}`);
};

export interface FulfillRequisitionRequest {
  batchId: number; // a batch is always a single fuel type — every line here must match its fuel type
  lines: RequisitionLineRequest[]; // books or litres issued now per (fuel type, denomination); must
  // not exceed outstandingBooks/outstandingLitres (litres must still divide evenly by the denomination)
  targetStatus?: CouponStatus;
  reason?: string;
  performedBy: string;
}

// Builds and submits the underlying transfer automatically — no litres-to-coupon-count math needed
// on the FE. Always defers for approval (202) in practice; the line's fulfilledLitres only increases
// once the receiving department calls confirmReceipt on the resulting transfer, not at fulfill/approve time.
// A line doesn't have to fully clear against the named batch — if it has fewer eligible coupons of a
// denomination than the litres requested imply, Stock still gets what's available (the rest stays
// outstanding); this only fails (400) if the batch has zero eligible coupons for every requested line,
// or if the batch's fuel type doesn't match a requested line's fuel type.
export const fulfillRequisition = (id: number, request: FulfillRequisitionRequest) => {
  return fetchApi<TransferResult | ApprovalRequest>(`/requisitions/${id}/fulfill`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

// reason is required by the backend. Valid while PENDING or PARTIALLY_FULFILLED.
export const rejectRequisition = (id: number, decidedBy: string, reason: string) => {
  return fetchApi<Requisition>(`/requisitions/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ decidedBy, reason })
  });
};

export interface AutoFulfillRequisitionRequest {
  performedBy: string;
  reason?: string;
  targetStatus?: CouponStatus;
}

// Response shape is a best guess pending a real payload to confirm against — the requisition's
// updated state plus one deferred transfer per batch it drew from.
export interface AutoFulfillResult {
  requisition: Requisition;
  transfers: ApprovalRequest[];
}

// Plans the whole requisition against its outstanding lines, walking each fuel type's batches
// oldest-first. Always 202 — one deferred transfer per batch drawn, same approval flow as a manual
// fulfill (see Approvals). No batch/line picking needed on the FE.
export const autoFulfillRequisition = (id: number, request: AutoFulfillRequisitionRequest) => {
  return fetchApi<AutoFulfillResult>(`/requisitions/${id}/auto-fulfill`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
};
