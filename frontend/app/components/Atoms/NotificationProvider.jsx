'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FiCheckCircle, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';
import { useAuth } from './AuthProvider';

const NotificationContext = createContext(null);

const keyFor = (id) => `notifications:${id || 'guest'}`;
const MAX = 50;

const TOAST_META = {
  success: { Icon: FiCheckCircle, color: 'text-teal-500' },
  error: { Icon: FiAlertCircle, color: 'text-red-500' },
  info: { Icon: FiInfo, color: 'text-blue-500' },
};

// Beautiful custom toast card (theme + dark-mode aware).
function showToast({ type = 'info', title, message }) {
  const { Icon, color } = TOAST_META[type] || TOAST_META.info;
  toast.custom(
    (t) => (
      <div
        className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 shadow-xl rounded-2xl pointer-events-auto flex gap-3 p-4`}
      >
        <Icon className={`${color} flex-shrink-0 mt-0.5`} size={20} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
          {message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">{message}</p>}
        </div>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <FiX size={16} />
        </button>
      </div>
    ),
    { duration: 4000 }
  );
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  // Load this user's notifications whenever the signed-in user changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(user?.id));
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, [user?.id]);

  const persist = useCallback(
    (next) => {
      const trimmed = next.slice(0, MAX);
      setItems(trimmed);
      try {
        localStorage.setItem(keyFor(user?.id), JSON.stringify(trimmed));
      } catch {
        /* ignore quota */
      }
    },
    [user?.id]
  );

  // Add a persistent notification to the bell.
  const push = useCallback(
    (n) => {
      const id =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        String(Date.now() + Math.random());
      const item = { id, title: n.title, message: n.message || '', type: n.type || 'info', read: false, at: Date.now() };
      setItems((prev) => {
        const next = [item, ...prev].slice(0, MAX);
        try {
          localStorage.setItem(keyFor(user?.id), JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      return item;
    },
    [user?.id]
  );

  // Persistent notification + a toast.
  const notify = useCallback(
    (n) => {
      push(n);
      showToast(n);
    },
    [push]
  );

  // Transient toast only (no bell entry) — e.g. "Logged out".
  const flash = useCallback((type, title, message) => showToast({ type, title, message }), []);

  const markAllRead = useCallback(() => persist(items.map((i) => ({ ...i, read: true }))), [items, persist]);
  const remove = useCallback((id) => persist(items.filter((i) => i.id !== id)), [items, persist]);
  const clear = useCallback(() => persist([]), [persist]);
  const unread = items.filter((i) => !i.read).length;

  return (
    <NotificationContext.Provider
      value={{
        items,
        unread,
        notify,
        push,
        flash,
        markAllRead,
        remove,
        clear,
        success: (title, message) => notify({ type: 'success', title, message }),
        error: (title, message) => notify({ type: 'error', title, message }),
        info: (title, message) => notify({ type: 'info', title, message }),
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationProvider');
  return ctx;
};
