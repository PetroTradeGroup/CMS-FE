import { fetchApi, API_BASE_URL } from './api';
import type { PagedResponse } from './api';
import { getAccessToken } from './auth';

// Mirrors the three sources the backend folds into one feed: coupon state changes, approval
// decisions, and security (auth/authorization) events. Drives the category filter tabs.
export type AuditCategory = 'COUPON_LIFECYCLE' | 'APPROVAL_DECISION' | 'SECURITY';

export const AUDIT_CATEGORIES: AuditCategory[] = ['COUPON_LIFECYCLE', 'APPROVAL_DECISION', 'SECURITY'];

export type AuditReferenceType = 'COUPON' | 'APPROVAL_REQUEST' | 'SECURITY_EVENT';

export interface AuditEntry {
  category: AuditCategory;
  // A MovementType (GENERATION, TRANSFER_OUT, REDEMPTION, ...) for COUPON_LIFECYCLE, an
  // ApprovalStatus (APPROVED, REJECTED, ...) for APPROVAL_DECISION, or a SecurityAuditOutcome
  // (ALLOWED, DENIED, UNAUTHENTICATED) for SECURITY.
  action: string;
  actor: string | null; // null only for an unauthenticated attempt — no token, so no identity
  occurredAt: string;
  referenceType: AuditReferenceType;
  referenceId: number;
  summary: string; // ready-to-render, human-readable — safe to print as-is
}

export interface AuditFilters {
  dateFrom?: string;
  dateTo?: string;
  actor?: string; // partial, case-insensitive
  category?: AuditCategory; // omit for every category
}

const auditFilterQuery = (filters?: AuditFilters) => {
  let query = '';
  if (filters) {
    if (filters.dateFrom) query += `&dateFrom=${filters.dateFrom}`;
    if (filters.dateTo) query += `&dateTo=${filters.dateTo}`;
    if (filters.actor) query += `&actor=${encodeURIComponent(filters.actor.trim())}`;
    if (filters.category) query += `&category=${filters.category}`;
  }
  return query;
};

// Always sorted newest-first server-side — unlike other paged endpoints, a `sort` param here
// would be accepted but ignored, so this deliberately doesn't take one.
export const getAuditLog = (page = 0, size = 20, filters?: AuditFilters) => {
  return fetchApi<PagedResponse<AuditEntry>>(`/audit?page=${page}&size=${size}${auditFilterQuery(filters)}`);
};

// Binary/stream download — bypasses fetchApi's JSON envelope and triggers a browser download.
const downloadAuditFile = async (path: string, fallbackFilename: string, errorLabel: string) => {
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

// Server names the file audit-log-<timestamp>.xlsx/pdf via Content-Disposition — the filename
// here is only the fallback for the rare response that omits that header.
export const exportAuditLog = (format: 'excel' | 'pdf', filters?: AuditFilters) => {
  const query = auditFilterQuery(filters).replace(/^&/, '');
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  return downloadAuditFile(
    `/audit/export/${format}${query ? `?${query}` : ''}`,
    `audit-log.${ext}`,
    `Failed to export the audit log as ${format === 'excel' ? 'Excel' : 'PDF'}`
  );
};

export const formatAuditCategory = (category: AuditCategory) => category.replace(/_/g, ' ');

export const getCategoryBadgeClass = (category: AuditCategory) => {
  switch (category) {
    case 'SECURITY':
      return 'badge-danger';
    case 'APPROVAL_DECISION':
      return 'badge-warning';
    default: // COUPON_LIFECYCLE
      return 'badge-info';
  }
};

// Outcomes/statuses worth calling out at a glance; everything else (the routine coupon
// movement types) gets the neutral "info" treatment.
const DANGER_ACTIONS = new Set(['DENIED', 'UNAUTHENTICATED', 'REJECTED', 'CANCELLATION', 'EXPIRY', 'FLAG']);
const SUCCESS_ACTIONS = new Set(['ALLOWED', 'APPROVED', 'GENERATION', 'RECEIPT', 'REDEMPTION']);

export const getActionBadgeClass = (action: string) => {
  if (DANGER_ACTIONS.has(action)) return 'badge-danger';
  if (SUCCESS_ACTIONS.has(action)) return 'badge-success';
  return 'badge-info';
};
