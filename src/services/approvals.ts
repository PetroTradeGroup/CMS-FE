import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Location, CouponStatus, DenominationLine } from './coupons';
import type { Department } from './departments';
import type { TransferredCoupon } from './batches';

// TRANSFERSHIPMENT/TRANSRECEIPT are the approval request's own status — distinct from
// CouponStatus.IN_TRANSIT, the coupon's own lifecycle status, which is unaffected by this rename
// and still literally IN_TRANSIT. The two enums happen to describe the same moment.
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'TRANSFERSHIPMENT' | 'TRANSRECEIPT' | 'REJECTED';

export interface ApprovalRequest {
  id: number;
  requestType: 'TRANSITION' | 'TRANSFER';
  couponNumbers: string[] | null; // populated for TRANSITION, and for a pinned denomination-pick TRANSFER
  batchNumber: string | null; // populated for TRANSFER, with the range below
  rangeStart: number | null;
  rangeEnd: number | null;
  targetStatus: CouponStatus | null;
  toLocation: Location | null;
  toDepartment: Department | null;
  reason: string | null;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  receivedBy: string | null; // set once confirm-receipt is called (department-changing transfers only)
  receivedAt: string | null;
  requisitionId: number | null; // set when this transfer was raised to fulfil a requisition
  // How many coupons this request covers — resolved once at creation from the selection mode used
  // (denomination pick, range, whole batch, or explicit numbers) and stable at every later stage.
  // Prefer this over couponNumbers.length/transferredCoupons.length, which are only populated in
  // specific cases (couponNumbers: TRANSITION or a pinned denomination-pick TRANSFER;
  // transferredCoupons: only the response of the one call that just moved coupons).
  count: number;
  // Same "fixed at creation, correct at every stage" reasoning as count — a per-denomination
  // breakdown of the already-resolved coupon list, computed once when the request is created.
  // Reliable through PENDING → TRANSFERSHIPMENT → TRANSRECEIPT, unlike deriving it from
  // transferredCoupons (see below), which is empty on every response except the one that just moved coupons.
  denominations: DenominationLine[];
  // Every coupon actually moved by *that* call — populated on approve() for everything except a
  // department-changing transfer, which instead populates it on confirmReceipt(). Empty until then.
  transferredCoupons: TransferredCoupon[];
}

export const getApprovals = (page = 0, size = 20, status?: ApprovalStatus) => {
  let url = `/approvals?page=${page}&size=${size}`;
  if (status) url += `&status=${status}`;
  return fetchApi<PagedResponse<ApprovalRequest>>(url);
};

export const getApproval = (id: number) => {
  return fetchApi<ApprovalRequest>(`/approvals/${id}`);
};

// For a TRANSITION, or a TRANSFER with only toLocationId, this applies fully → APPROVED.
// For a TRANSFER that also sets toDepartmentId, this only issues the coupons to TRANSFERSHIPMENT
// (the coupons themselves become CouponStatus.IN_TRANSIT) — the receiving department must
// separately call confirmReceipt to finish the move.
export const approveRequest = (id: number, approvedBy: string, reason?: string) => {
  return fetchApi<ApprovalRequest>(`/approvals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy, reason: reason || null })
  });
};

// The receiving department's sign-off that TRANSFERSHIPMENT coupons arrived — applies the real
// target status (or IN_STOCK if none was requested) and moves the coupons into toLocation/toDepartment.
// Only valid while the request is TRANSFERSHIPMENT.
export const confirmReceipt = (id: number, receivedBy: string, reason?: string) => {
  return fetchApi<ApprovalRequest>(`/approvals/${id}/confirm-receipt`, {
    method: 'POST',
    body: JSON.stringify({ receivedBy, reason: reason || null })
  });
};

// reason is required by the backend — 400 without it. Only valid while PENDING.
export const rejectRequest = (id: number, approvedBy: string, reason: string) => {
  return fetchApi<ApprovalRequest>(`/approvals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ approvedBy, reason })
  });
};
