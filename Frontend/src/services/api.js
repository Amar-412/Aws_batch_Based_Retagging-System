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

export async function createBatchJobs(plan) {
  const response = await api.post('/batch/create', plan);
  return response.data;
}

export async function listBatchJobs({ status, jobId, limit, cursor } = {}) {
  const response = await api.get('/batch/jobs', {
    params: {
      status: status || undefined,
      jobId: jobId || undefined,
      limit,
      cursor: cursor || undefined,
    },
  });
  return response.data;
}

export async function getBatchJob(jobId) {
  const response = await api.get(`/batch/${encodeURIComponent(jobId)}`);
  return response.data;
}

export async function downloadBatchReport(jobId) {
  let response;
  try {
    response = await api.get(`/batch/${encodeURIComponent(jobId)}/report`, {
      responseType: 'blob',
    });
  } catch (err) {
    if (err.response?.data instanceof Blob) {
      const text = await err.response.data.text();
      try {
        err.response.data = JSON.parse(text);
      } catch {
        err.response.data = { message: text };
      }
    }
    throw err;
  }
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `batch-report-${jobId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default api;