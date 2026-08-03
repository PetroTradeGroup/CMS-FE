import { fetchApi } from './api';
import type { PagedResponse } from './api';
import type { Coupon } from './coupons';

// ─── Request shapes ──────────────────────────────────────────────────────────

export interface NaturalLanguageQueryRequest {
  question: string;
}

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface AppliedFilters {
  status?: string;
  fuelTypeId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface NaturalLanguageQueryResponse {
  question: string;
  interpretation: string;
  appliedFilters: AppliedFilters;
  results: PagedResponse<Coupon>;
}

export interface FuelTypeStats {
  fuelTypeName: string;
  typeCode: string;
  totalIssued: number;
  active: number;
  used: number;
  expired: number;
}

export interface SequenceCapacity {
  fuelTypeName: string;
  currentLetter: string;
  issuedInCurrentLetter: number;
  capacityUsedPercent: number;
}

export interface CouponStatsSnapshot {
  totalCoupons: number;
  activeCoupons: number;
  usedCoupons: number;
  expiredCoupons: number;
  issuedThisWeek: number;
  issuedLastWeek: number;
  fuelTypeBreakdown: FuelTypeStats[];
  sequenceCapacities: SequenceCapacity[];
  asOf: string;
}

export interface InsightResponse {
  summary: string;
  stats: CouponStatsSnapshot;
  generatedAt: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai/query
 * Send a natural language question and receive matching coupons + AI interpretation.
 */
export const queryAi = (question: string, page = 0, size = 20) =>
  fetchApi<NaturalLanguageQueryResponse>(
    `/ai/query?page=${page}&size=${size}`,
    {
      method: 'POST',
      body: JSON.stringify({ question }),
    }
  );

/**
 * GET /api/v1/insights
 * Retrieve AI-generated business intelligence on coupon usage trends.
 */
export const getInsights = () =>
  fetchApi<InsightResponse>('/insights');
