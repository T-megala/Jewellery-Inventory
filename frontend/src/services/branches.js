import { apiFetch } from './api.js';
import { applySessionFromPayload } from './auth.js';

function normalizeBranch(branch) {
  return {
    id: Number(branch.id),
    name: branch.name,
    address: branch.address ?? '',
    city: branch.city ?? '',
    phone: branch.phone ?? '',
    isMain: Boolean(branch.isMain),
    createdAt: branch.created_at ?? branch.createdAt ?? null,
    updatedAt: branch.updated_at ?? branch.updatedAt ?? null,
  };
}

export async function fetchBranches() {
  const data = await apiFetch('/branches');
  return (data || []).map(normalizeBranch);
}

export async function createBranch(payload) {
  const data = await apiFetch('/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  applySessionFromPayload(data);

  const branch = data?.branch ?? data;
  return normalizeBranch(branch);
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
