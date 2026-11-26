import { io } from 'socket.io-client';

let socket = null;

export function connectSocket() {
  const token = localStorage.getItem('revisex_token');
  if (!token) return null;

  if (socket && socket.connected) return socket;

  const socketUrl = import.meta.env.VITE_SOCKET_URL || '/';
  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
