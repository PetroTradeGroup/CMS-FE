import { fetchApi } from './api';

export interface Department {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

// Unpaged list — intended for dropdowns (generation, transfers, filters)
export const getDepartments = (activeOnly = true) => {
  return fetchApi<Department[]>(`/departments${activeOnly ? '?active=true' : ''}`);
};

export const getDepartment = (id: number) => {
  return fetchApi<Department>(`/departments/${id}`);
};

export const createDepartment = (code: string, name: string) => {
  return fetchApi<Department>('/departments', {
    method: 'POST',
    body: JSON.stringify({ code, name })
  });
};

// No DELETE — deactivate via active: false instead (audit requirement)
export const updateDepartment = (id: number, body: { name: string; active: boolean }) => {
  return fetchApi<Department>(`/departments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
};
