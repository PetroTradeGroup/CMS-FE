import { fetchApi } from './api';

// Who runs a site — Petrotrade, or a third party redeeming on our behalf (e.g. Redan).
// Reports can be filtered/aggregated by company. Admin and Regional Rep manage them.
export interface Company {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export const getCompanies = () => fetchApi<Company[]>('/companies');

// code: ≤20, unique, upper-cased by the backend. 400 on a duplicate code or name.
export const createCompany = (body: { code: string; name: string }) =>
  fetchApi<Company>('/companies', { method: 'POST', body: JSON.stringify(body) });

// The code never changes — only name and active.
export const updateCompany = (id: number, body: { name: string; active: boolean }) =>
  fetchApi<Company>(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(body) });
