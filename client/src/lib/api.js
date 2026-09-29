/**
 * Axios instance for the Waitwell REST API. Adds the JWT to every request and
 * broadcasts a logout when the server says the session is no longer valid.
 */
import axios from 'axios';

export const API_ORIGIN = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'waitwell.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const api = axios.create({ baseURL: `${API_ORIGIN}/api`, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthCall = err.config?.url?.startsWith('/auth/login') || err.config?.url?.startsWith('/auth/register');
    if (err.response?.status === 401 && !isAuthCall) {
      window.dispatchEvent(new CustomEvent('waitwell:unauthorized'));
    }
    return Promise.reject(err);
  }
);

/** Human-readable message from any API error. */
export function errorMessage(err) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (err?.request && !err.response) return 'Cannot reach the server. Check that the backend is running.';
  return 'Something went wrong. Please try again.';
}

/* ---- Endpoint helpers (one place documents every call the UI makes) ---- */
export const AuthAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data.user),
  staff: () => api.get('/auth/staff').then((r) => r.data.staff),
  createStaff: (payload) => api.post('/auth/staff', payload).then((r) => r.data),
};

export const BusinessAPI = {
  list: (params) => api.get('/businesses', { params }).then((r) => r.data.businesses),
  page: (slug) => api.get(`/businesses/${slug}`).then((r) => r.data),
  signup: (payload) => api.post('/businesses', payload).then((r) => r.data),
  mine: () => api.get('/businesses/mine').then((r) => r.data.business),
  updateMine: (payload) => api.put('/businesses/mine', payload).then((r) => r.data),
};

export const ServiceAPI = {
  list: (params) => api.get('/services', { params }).then((r) => r.data.services),
  get: (id) => api.get(`/services/${id}`).then((r) => r.data.service),
  create: (payload) => api.post('/services', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/services/${id}`, payload).then((r) => r.data),
  pause: (id) => api.post(`/services/${id}/pause`).then((r) => r.data),
  resume: (id) => api.post(`/services/${id}/resume`).then((r) => r.data),
  statistics: (id) => api.get(`/services/${id}/statistics`).then((r) => r.data.statistics),
  insights: (id) => api.get(`/services/${id}/insights`).then((r) => r.data.insights),
  slots: (id, date) => api.get(`/services/${id}/slots`, { params: { date } }).then((r) => r.data),
  appointments: (id, date) => api.get(`/services/${id}/appointments`, { params: { date } }).then((r) => r.data),
};

export const QueueAPI = {
  join: (serviceId) => api.post('/queues/join', { serviceId }).then((r) => r.data),
  myPosition: () => api.get('/queues/my-position').then((r) => r.data.entries),
  myHistory: () => api.get('/queues/my-history').then((r) => r.data.entries),
  get: (serviceId) => api.get(`/queues/${serviceId}`).then((r) => r.data),
  cancel: (queueId) => api.delete(`/queues/${queueId}`).then((r) => r.data),
  walkIn: (serviceId, payload) => api.post(`/queues/${serviceId}/walk-in`, payload).then((r) => r.data),
  callNext: (serviceId) => api.post(`/queues/${serviceId}/next`).then((r) => r.data),
  complete: (queueId) => api.post(`/queues/${queueId}/complete`).then((r) => r.data),
  skip: (queueId) => api.post(`/queues/${queueId}/skip`).then((r) => r.data),
};

export const AppointmentAPI = {
  book: (serviceId, slotStart) => api.post('/appointments', { serviceId, slotStart }).then((r) => r.data),
  mine: () => api.get('/appointments/mine').then((r) => r.data),
  cancel: (id) => api.delete(`/appointments/${id}`).then((r) => r.data),
  checkIn: (id) => api.post(`/appointments/${id}/check-in`).then((r) => r.data),
};

export const ReportAPI = {
  daily: (params) => api.get('/reports/daily', { params }).then((r) => r.data.report),
};

export const PublicAPI = {
  board: (slug) => api.get(`/public/${slug}/board`).then((r) => r.data),
  track: (slug, serviceId, token) => api.get(`/public/${slug}/track`, { params: { serviceId, token } }).then((r) => r.data.entry),
};

export default api;
