import { io } from 'socket.io-client';

let socket = null;

export function connectSocket() {
  const token = localStorage.getItem('revisex_token');
  if (!token) return null;

  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const configuredUrl = import.meta.env.VITE_SOCKET_URL;
  if (!configuredUrl && !isLocal) {
    return null;
  }

  if (socket && socket.connected) return socket;

  socket = io(configuredUrl || '/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 2,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
