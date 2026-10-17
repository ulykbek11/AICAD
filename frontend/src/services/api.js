/**
 * API Service for Draftly
 * Handles all communication with the backend API.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('draftly_token');
  }

  getHeaders(includeAuth = true) {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (includeAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('draftly_token', token);
    } else {
      localStorage.removeItem('draftly_token');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(options.auth !== false),
        ...options.headers,
      },
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || 'Request failed');
    }
    
    if (response.status === 204) {
      return null;
    }
    
    return response.json();
  }

  async signup(email, password, fullName) {
    const data = await this.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
      auth: false,
    });
    return data;
  }

  async login(email, password) {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Login failed');
    }
    
    const data = await response.json();
    this.setToken(data.access_token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  async joinWaitlist(email, source = 'landing') {
    return this.request('/api/auth/waitlist', {
      method: 'POST',
      body: JSON.stringify({ email, source }),
      auth: false,
    });
  }

  async getProjects() {
    return this.request('/api/projects/');
  }

  async createProject(name, description) {
    return this.request('/api/projects/', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async getProject(projectId) {
    return this.request(`/api/projects/${projectId}`);
  }

  async updateProject(projectId, data) {
    return this.request(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProject(projectId) {
    return this.request(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async createDrawing(projectId, drawingData) {
    return this.request(`/api/projects/${projectId}/drawings`, {
      method: 'POST',
      body: JSON.stringify(drawingData),
    });
  }

  async getDrawing(projectId, drawingId) {
    return this.request(`/api/projects/${projectId}/drawings/${drawingId}`);
  }

  async updateDrawing(projectId, drawingId, data) {
    return this.request(`/api/projects/${projectId}/drawings/${drawingId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDrawing(projectId, drawingId) {
    return this.request(`/api/projects/${projectId}/drawings/${drawingId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();
export default api;
