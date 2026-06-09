import { apiUpload } from './api.js';

export function uploadStockExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return apiUpload('/products/import', formData);
}
