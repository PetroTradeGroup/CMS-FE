import { getAccessToken, refreshAccessToken, logout } from './auth';

export const API_BASE_URL = '/api/v1';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export const getErrorMessage = (err: unknown, fallback = 'An unexpected error occurred') =>
  err instanceof Error ? err.message : fallback;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}


export interface ApiResult<T> extends ApiResponse<T> {
  status: number;
}

const buildHeaders = (options: RequestInit): HeadersInit => {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
};

export const fetchApi = async <T>(endpoint: string, options: RequestInit = {}): Promise<ApiResult<T>> => {
  const url = `${API_BASE_URL}${endpoint}`;

  let response = await fetch(url, { ...options, headers: buildHeaders(options) });

  // Access tokens expire quickly — silently refresh once and retry before giving up
  let refreshed = false;
  if (response.status === 401) {
    refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(url, { ...options, headers: buildHeaders(options) });
    }
  }

  // A 401 that survives a *successful* token refresh isn't an expired session — it's this
  // request being rejected on its own merits (e.g. the account lacks a role/permission for this
  // endpoint). Only a failed refresh (no valid refresh token left) means the session is actually
  // dead and worth forcing back to login.
  if (response.status === 401 && !refreshed) {
    logout();
    window.location.href = '/';
    throw new ApiError('Session expired, please sign in again', 401);
  }

  const data = await response.json();

  if (!response.ok) {
    // On a validation failure, `data` holds a field -> message map instead of the usual payload
    // (e.g. { performedBy: "Performed-by is required" }) — fold it into the error text so it
    // reaches the UI instead of only the generic "Validation failed" envelope message.
    const fieldErrors = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
      ? Object.values(data.data).filter((v): v is string => typeof v === 'string')
      : [];
    const message = fieldErrors.length > 0 ? fieldErrors.join(' ') : (data.message || 'An error occurred during the request');
    throw new ApiError(message, response.status);
  }

  return { ...data, status: response.status };
};
