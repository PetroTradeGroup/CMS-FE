import { fetchApi, API_BASE_URL } from './api';
import type { PagedResponse } from './api';
import type { Coupon, Location, CouponStatus, DenominationLine } from './coupons';
import type { Department } from './departments';
import type { TransferredCoupon } from './batches';
import { getAccessToken } from './auth';

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
  carRegistrationNumber: string; // vehicle the redemption was for — backend trims + upper-cases
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

// Attendant / Team Leader only. The station and attendant come from the login token — there's no
// location or performed-by field (an account with no station gets 403).
export interface SubmitRedemptionRequest {
  scannedPayloads?: string[]; // raw scanned QR strings, sent as-is — not decoded/parsed client-side
  couponNumbers?: string[]; // typed manually — physical coupons only (400 for a virtual one)
  redemptionCodes?: string[]; // virtual coupons' 7-character codes; backend ignores case, spaces, hyphens
  carRegistrationNumber: string; // required (max 20); backend trims + upper-cases
  reason?: string;
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
  message: string | null; // why it isn't redeemable, e.g. wrong status, already redeemed; null when redeemable
}

// Read-only — verifies a single scanned QR payload (its HMAC signature, then the coupon's
// current state) without submitting anything. 400 if the payload is forged/corrupted. Lets the
// scan screen give per-coupon feedback before the attendant commits the batch.
export const verifyRedemptionScan = (payload: string) => {
  return fetchApi<ScanVerifyResult>('/redemptions/scan', {
    method: 'POST',
    body: JSON.stringify({ payload })
  });
};

// Same check for a coupon number typed by hand (fallback for a damaged QR) — no signature to
// verify, so an unknown number is 404 rather than the 400 a forged QR gets.
export const verifyRedemptionScanByCouponNumber = (couponNumber: string) => {
  return fetchApi<ScanVerifyResult>(`/redemptions/scan/${encodeURIComponent(couponNumber)}`);
};

// Same check for a virtual coupon, looked up by its redemption code rather than a coupon number
// or QR. Open to Admins as well as attendants — Admins can verify but not redeem.
export const verifyRedemptionScanByCode = (code: string) => {
  return fetchApi<ScanVerifyResult>(`/redemptions/scan/code/${encodeURIComponent(code)}`);
};

export interface RedemptionDenominationLine {
  denomination: number;
  count: number;
  litres: number;
}

export interface RedemptionFuelTypeSummary {
  fuelTypeId: number;
  fuelTypeName: string;
  count: number;
  litres: number;
  byDenomination: RedemptionDenominationLine[];
}

// Both summary responses echo back the filters the backend actually applied (dateFrom/dateTo,
// locationId, fuelTypeId) so the UI can reconcile what it asked for with what it got.
export interface RedemptionSummary {
  dateFrom: string;     // start of the reported range, inclusive (ISO date)
  dateTo: string;       // end of the reported range, inclusive (ISO date)
  locationId: number | null; // the site the totals are scoped to, or null for all sites
  fuelTypeId: number | null; // the fuel type filter applied, or null for all
  totalCoupons: number;
  totalLitres: number;
  byFuelType: RedemptionFuelTypeSummary[];
}

export interface RedemptionAttendantLine {
  requestedBy: string;
  count: number;
  litres: number;
}

export interface RedemptionByAttendant {
  dateFrom: string;
  dateTo: string;
  locationId: number | null;
  fuelTypeId: number | null;
  totalCoupons: number;
  totalLitres: number;
  byAttendant: RedemptionAttendantLine[];
}

// Pass `date` for a single day, or `dateFrom`/`dateTo` for an inclusive range; omit all for
// today. `locationId` only takes effect for non-retail callers (Admin/Stocks); for an
// Attendant/Team Leader the backend scopes to their own station from the token and ignores it —
// a plain Attendant is narrowed further to just their own redemptions, a Team Leader sees the
// whole site. `fuelTypeId` narrows to one fuel type (any caller).
export interface RedemptionSummaryParams {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  locationId?: number;
  fuelTypeId?: number;
}

const dateParams = (p: RedemptionSummaryParams) => {
  const params = new URLSearchParams();
  if (p.date) params.set('date', p.date);
  if (p.dateFrom) params.set('dateFrom', p.dateFrom);
  if (p.dateTo) params.set('dateTo', p.dateTo);
  if (p.fuelTypeId) params.set('fuelTypeId', String(p.fuelTypeId));
  return params;
};

const withQs = (path: string, params: URLSearchParams) => {
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
};

// Totals plus a per-fuel-type / per-denomination breakdown over the range.
export const getRedemptionSummary = (params: RedemptionSummaryParams = {}) => {
  const qp = dateParams(params);
  if (params.locationId) qp.set('locationId', String(params.locationId));
  return fetchApi<RedemptionSummary>(withQs('/redemptions/summary', qp));
};

// Per-attendant coupon count and litres over the range — Team Leader only, always their own
// station (no locationId param). `attendantUsername` narrows to one attendant; omit for
// everyone at the station.
export interface RedemptionByAttendantParams extends RedemptionSummaryParams {
  attendantUsername?: string;
}

export const getRedemptionByAttendant = (params: RedemptionByAttendantParams = {}) => {
  const qp = dateParams(params);
  if (params.attendantUsername) qp.set('attendantUsername', params.attendantUsername);
  return fetchApi<RedemptionByAttendant>(withQs('/redemptions/summary/by-attendant', qp));
};

// One attendant's own fuel-type / denomination breakdown — same RedemptionSummary shape as
// GET /summary, but scoped to a single attendant at the caller's station. Team Leader only,
// no locationId. Use after getRedemptionByAttendant to drill into one name.
export const getRedemptionSummaryForAttendant = (
  attendantUsername: string,
  params: RedemptionSummaryParams = {}
) => {
  const qp = dateParams(params);
  return fetchApi<RedemptionSummary>(
    withQs(`/redemptions/summary/by-attendant/${encodeURIComponent(attendantUsername)}`, qp)
  );
};

// The export endpoints stream a file (not the JSON envelope), so they bypass fetchApi and
// trigger a browser download directly. On failure the backend still returns the JSON error
// envelope, so we try to surface its message.
export type RedemptionSummaryExportFormat = 'excel' | 'pdf';

const streamDownload = async (path: string, fallbackFilename: string, errorLabel: string) => {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

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

const formatLabel = (format: RedemptionSummaryExportFormat) => (format === 'excel' ? 'Excel' : 'PDF');
const formatExt = (format: RedemptionSummaryExportFormat) => (format === 'excel' ? 'xlsx' : 'pdf');

// Whole-scope export (all attendants at the site, or one site for Admin). Same filters as
// GET /summary.
export const exportRedemptionSummary = (
  format: RedemptionSummaryExportFormat,
  params: RedemptionSummaryParams = {}
) => {
  const qp = dateParams(params);
  if (params.locationId) qp.set('locationId', String(params.locationId));
  return streamDownload(
    withQs(`/redemptions/summary/export/${format}`, qp),
    `redemption-summary.${formatExt(format)}`,
    `Failed to export the redemption summary as ${formatLabel(format)}`
  );
};

// One attendant's report — matches getRedemptionSummaryForAttendant. Team Leader only.
export const exportRedemptionSummaryForAttendant = (
  attendantUsername: string,
  format: RedemptionSummaryExportFormat,
  params: RedemptionSummaryParams = {}
) => {
  const qp = dateParams(params);
  return streamDownload(
    withQs(`/redemptions/summary/by-attendant/${encodeURIComponent(attendantUsername)}/export/${format}`, qp),
    `redemption-${attendantUsername}.${formatExt(format)}`,
    `Failed to export ${attendantUsername}'s redemption summary as ${formatLabel(format)}`
  );
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

// `locationId` only takes effect for non-retail callers (Admin/Stocks) — a retail caller is
// scoped to their own station from the token and it's ignored. Omit for all sites.
export const getRedemptions = (page = 0, size = 20, status?: RedemptionStatus, locationId?: number) => {
  let url = `/redemptions?page=${page}&size=${size}`;
  if (status) url += `&status=${status}`;
  if (locationId) url += `&locationId=${locationId}`;
  return fetchApi<PagedResponse<RedemptionRequest>>(url);
};

export const getRedemption = (id: number) => {
  return fetchApi<RedemptionRequest>(`/redemptions/${id}`);
};
