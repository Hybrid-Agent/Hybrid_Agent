'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FiBell, FiCheckCircle, FiAlertCircle, FiInfo, FiTrash2, FiCheck } from 'react-icons/fi';
import { useNotifications } from '../Atoms/NotificationProvider';
import { timeAgo } from '@/lib/format';

const ICON = {
  success: { Icon: FiCheckCircle, color: 'text-teal-500' },
  error: { Icon: FiAlertCircle, color: 'text-red-500' },
  info: { Icon: FiInfo, color: 'text-blue-500' },
};

const NotificationBell = () => {
  const { items, unread, markAllRead, remove, clear } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = () => {
    setOpen((o) => {
      if (!o && unread > 0) markAllRead();
      return !o;
    });
  };

  return (
    <div className="relative flex items-center justify-center" ref={ref}>
      <button
        onClick={toggle}
        className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <FiBell size={22} className="text-gray-600 dark:text-gray-300" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed top-[70px] right-4 sm:absolute sm:top-full sm:right-0 sm:mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-[360px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50 animate-scale-in origin-top-right overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Notifications</h4>
            {items.length > 0 && (
              <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
                <FiTrash2 size={12} /> Clear
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FiBell size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-400">You're all caught up.</p>
              </div>
            ) : (
              items.map((n) => {
                const { Icon, color } = ICON[n.type] || ICON.info;
                return (
                  <div
                    key={n.id}
                    className="group flex gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <Icon className={`${color} flex-shrink-0 mt-0.5`} size={18} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{n.title}</p>
                      {n.message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words break-all">{n.message}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.at)}</p>
                    </div>
                    <button
                      onClick={() => remove(n.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                      aria-label="Remove"
                    >
                      <FiCheck size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
