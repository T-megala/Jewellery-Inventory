import { apiFetch } from './api.js';

function normalizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role ?? 'user',
    createdAt: user.created_at ?? user.createdAt ?? null,
  };
}

export async function fetchUsers() {
  const data = await apiFetch('/users');
  return (data || []).map(normalizeUser);
}

export function createUser({ username, password, role }) {
  const body = { username, password };
  if (role) body.role = role;

  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(normalizeUser);
}

export function updateUser(id, { username, password, role }) {
  const body = {};

  if (username) {
    body.username = username;
  }

  if (password) {
    body.password = password;
  }

  if (role) {
    body.role = role;
  }

  return apiFetch(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then(normalizeUser);
}

export async function deleteUser(id) {
  await apiFetch(`/users/${id}`, {
    method: 'DELETE',
  });
}
