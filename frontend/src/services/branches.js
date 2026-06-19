import { apiFetch } from './api.js';

function normalizeBranch(branch) {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address ?? '',
    city: branch.city ?? '',
    phone: branch.phone ?? '',
    isMain: Boolean(branch.isMain),
    isActive: branch.isActive !== false,
    createdAt: branch.created_at ?? branch.createdAt ?? null,
    updatedAt: branch.updated_at ?? branch.updatedAt ?? null,
  };
}

export async function fetchBranches({ includeInactive = true } = {}) {
  const query = includeInactive ? '?includeInactive=true' : '';
  const data = await apiFetch(`/branches${query}`);
  return (data || []).map(normalizeBranch);
}

export function createBranch(payload) {
  return apiFetch('/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(normalizeBranch);
}

export function updateBranch(id, payload) {
  return apiFetch(`/branches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then(normalizeBranch);
}

export async function deleteBranch(id) {
  await apiFetch(`/branches/${id}`, {
    method: 'DELETE',
  });
}
