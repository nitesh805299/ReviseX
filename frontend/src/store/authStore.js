import { create } from 'zustand';
import { api } from '../lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,
  initialized: false,

  init: async () => {
    const token = localStorage.getItem('revisex_token');
    if (!token) {
      set({ user: null, loading: false, initialized: true });
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, loading: false, initialized: true });
    } catch {
      localStorage.removeItem('revisex_token');
      set({ user: null, loading: false, initialized: true });
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('revisex_token', data.token);
    set({ user: data.user, loading: false, initialized: true });
    return data.user;
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('revisex_token', data.token);
    set({ user: data.user, loading: false, initialized: true });
    return data.user;
  },

  updateProfile: async (payload) => {
    const { data } = await api.patch('/auth/me', payload);
    set({ user: data.user });
    return data.user;
  },

  logout: async () => {
    await api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('revisex_token');
    set({ user: null });
  },
}));
