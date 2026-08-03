import { fetchApi } from './api';

export interface BulkLimit {
  maxCount: number;
  updatedAt: string;
}

export const getBulkLimit = () => {
  return fetchApi<BulkLimit>('/config/bulk-limit');
};

export const updateBulkLimit = (maxCount: number) => {
  return fetchApi<BulkLimit>('/config/bulk-limit', {
    method: 'PATCH',
    body: JSON.stringify({ maxCount })
  });
};

export interface ValidityPeriod {
  defaultValidityDays: number;
  updatedAt: string;
}

// Applied when generation is called without an expiryDate: creation date + this many days.
// Changing it never rewrites existing coupons. Accepted range: 1–3650.
export const getValidityPeriod = () => {
  return fetchApi<ValidityPeriod>('/config/validity-period');
};

export const updateValidityPeriod = (defaultValidityDays: number) => {
  return fetchApi<ValidityPeriod>('/config/validity-period', {
    method: 'PATCH',
    body: JSON.stringify({ defaultValidityDays })
  });
};
