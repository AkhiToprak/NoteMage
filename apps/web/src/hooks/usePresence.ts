'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3002';
const HEARTBEAT_INTERVAL = 30_000;
const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000; // refresh token every 4 min (TTL is 5 min)

interface PresenceState {
  onlineFriendIds: Set<string>;
  connected: boolean;
}

export function usePresence(): PresenceState {
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/presence-token');
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.token || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const token = await fetchToken();
      if (!token || !mounted) return;

      const socket = io(WS_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (mounted) setConnected(true);
      });

      socket.on('disconnect', () => {
        if (mounted) setConnected(false);
      });

      socket.on('presence:init', (data: { onlineFriendIds: string[] }) => {
        if (mounted) setOnlineFriendIds(new Set(data.onlineFriendIds));
      });

      socket.on('presence:update', (data: { online: string[]; offline: string[] }) => {
        if (!mounted) return;
        setOnlineFriendIds((prev) => {
          const next = new Set(prev);
          for (const id of data.online) next.add(id);
          for (const id of data.offline) next.delete(id);
          return next;
        });
      });

      socket.on('auth_error', () => {
        socket.disconnect();
      });

      // Heartbeat
      heartbeatRef.current = setInterval(() => {
        if (socket.connected) {
          socket.emit('heartbeat');
        }
      }, HEARTBEAT_INTERVAL);

      // Token refresh — reconnect with fresh token before expiry
      tokenRefreshRef.current = setInterval(async () => {
        const newToken = await fetchToken();
        if (newToken && socket.connected) {
          socket.auth = { token: newToken };
          // Socket.IO will use the new auth on next reconnection
        }
      }, TOKEN_REFRESH_INTERVAL);
    }

    connect();

    return () => {
      mounted = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [fetchToken]);

  return { onlineFriendIds, connected };
}
