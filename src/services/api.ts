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

// The HTTP status matters on some endpoints (200 vs 202 on transfers/transitions),
// so it is exposed alongside the parsed envelope.
export interface ApiResult<T> extends ApiResponse<T> {
  status: number;
}

export const fetchApi = async <T>(endpoint: string, options: RequestInit = {}): Promise<ApiResult<T>> => {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.message || 'An error occurred during the request', response.status);
  }

  return { ...data, status: response.status };
};
