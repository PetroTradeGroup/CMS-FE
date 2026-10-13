import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Location, CouponStatus, FuelType } from './coupons';
import type { Department } from './departments';
import type { ApprovalRequest } from './approvals';

// PENDING (Sales Clerk raised) → COMMERCIAL_APPROVED (Commercial Manager/Rep) → APPROVED (Stocks
// Controller) → (PARTIALLY_FULFILLED)* → FULFILLED, or REJECTED from any non-terminal status.
// Stocks issue (GIV) only from APPROVED/PARTIALLY_FULFILLED; PARTIALLY_FULFILLED means at least one
// delivery has been received but a line still has litres outstanding.
export type RequisitionStatus =
  'PENDING' | 'COMMERCIAL_APPROVED' | 'APPROVED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'REJECTED';

export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  PENDING: 'Awaiting Commercial',
  COMMERCIAL_APPROVED: 'Awaiting Stocks',
  APPROVED: 'Approved',
  PARTIALLY_FULFILLED: 'Partially Fulfilled',
  FULFILLED: 'Fulfilled',
  REJECTED: 'Rejected',
};

export const requisitionBadge = (status: RequisitionStatus) => {
  switch (status) {
    case 'PENDING':
    case 'COMMERCIAL_APPROVED': return 'badge-warning';
    case 'APPROVED':
    case 'PARTIALLY_FULFILLED': return 'badge-info';
    case 'FULFILLED': return 'badge-success';
    default: return 'badge-danger'; // REJECTED
  }
};

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
  commercialApprovedBy: string | null;
  commercialApprovedAt: string | null;
  stocksApprovedBy: string | null;
  stocksApprovedAt: string | null;
  decidedBy: string | null; // who rejected it, if anyone
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
  departmentId?: number; // only read when the caller's token has no department (e.g. Admin)
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

// The Stocks Clerk's issue (GIV) — only from APPROVED/PARTIALLY_FULFILLED (409 otherwise). Builds the
// underlying transfer and, since the Stocks Controller already approved the requisition, issues it
// straight away: the response is the transfer, already TRANSFERSHIPMENT (coupons In Transit). The
// line's fulfilledLitres only increases once the Sales Clerk confirms receipt (GRV) on that transfer.
// A line doesn't have to fully clear against the named batch — if it has fewer eligible coupons of a
// denomination than the litres requested imply, Stock still gets what's available (the rest stays
// outstanding); this only fails (400) if the batch has zero eligible coupons for every requested line,
// or if the batch's fuel type doesn't match a requested line's fuel type.
export const fulfillRequisition = (id: number, request: FulfillRequisitionRequest) => {
  return fetchApi<ApprovalRequest>(`/requisitions/${id}/fulfill`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
};

// Commercial Manager / Rep's sign-off on a PENDING requisition. Approver comes from the token.
export const approveRequisitionCommercial = (id: number) => {
  return fetchApi<Requisition>(`/requisitions/${id}/commercial-approve`, { method: 'POST' });
};

// Stocks Controller's sign-off on a COMMERCIAL_APPROVED requisition. Approver comes from the token.
export const approveRequisitionStocks = (id: number) => {
  return fetchApi<Requisition>(`/requisitions/${id}/approve`, { method: 'POST' });
};

// reason is required by the backend. Commercial rejects while PENDING; the Stocks Controller from
// COMMERCIAL_APPROVED onwards (closing out the rest of a PARTIALLY_FULFILLED one).
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

// The requisition's updated state plus one issued (In Transit) transfer — one GIV — per batch drawn from.
export interface AutoFulfillResult {
  requisition: Requisition;
  transfers: ApprovalRequest[];
}

// Plans the whole requisition against its outstanding lines, walking each fuel type's batches
// oldest-first, and issues straight away — same as a manual fulfill. No batch/line picking needed.
export const autoFulfillRequisition = (id: number, request: AutoFulfillRequisitionRequest) => {
  return fetchApi<AutoFulfillResult>(`/requisitions/${id}/auto-fulfill`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
};
