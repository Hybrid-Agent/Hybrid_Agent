import { io, Socket } from 'socket.io-client';
import { storage } from './storage';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  const token = await storage.getToken();
  if (socket && socket.connected) return socket;
  if (!socket) {
    socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
    });
  } else {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
