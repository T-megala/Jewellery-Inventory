import { apiFetch } from './api.js';

function normalizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.created_at ?? user.createdAt ?? null,
  };
}

export async function fetchUsers() {
  const data = await apiFetch('/users');
  return (data || []).map(normalizeUser);
}

export function createUser({ username, password }) {
  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }).then(normalizeUser);
}

export function updateUser(id, { username, password }) {
  const body = {};

  if (username) {
    body.username = username;
  }

  if (password) {
    body.password = password;
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
