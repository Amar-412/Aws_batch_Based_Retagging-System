import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

/**
 * Upload a CSV of S3 object references.
 * The browser sets the multipart boundary automatically.
 */
export async function uploadCsv(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload/csv', formData);
  return response.data;
}

/**
 * Ask the backend to HeadObject each parsed reference.
 */
export async function validateObjects(objects) {
  const response = await api.post('/objects/validate', { objects });
  return response.data;
}

export async function validateRule(rule) {
  const response = await api.post('/rules/validate', { rule });
  return response.data;
}

export async function evaluateRulesBatch(objects, rules) {
  const response = await api.post('/rules/evaluate-batch', {
    objects,
    rules,
  });

  return response.data;
}

export async function generatePreview(objects, rules) {
  const response = await api.post('/preview', { objects, rules });
  return response.data;
}

export default api;