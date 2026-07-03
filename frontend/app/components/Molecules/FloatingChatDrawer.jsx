'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FiMessageSquare, FiX } from 'react-icons/fi';
import { useAuth } from '../Atoms/AuthProvider';
import { Skeleton } from '../Atoms/Loaders';
import ChatPanel from './ChatPanel';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { timeAgo } from '@/lib/format';

const FloatingChatDrawer = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeConv, setActiveConv] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setConversations(await api.conversations()); }
    catch { /* offline */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onNotify = () => { if (open) load(); };
    socket.on('message:notify', onNotify);
    return () => socket.off('message:notify', onNotify);
  }, [user, open, load]);

  if (!user) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chats' : 'Open chats'}
        className="fixed bottom-8 right-6 z-40 w-14 h-14 bg-teal-600 hover:bg-teal-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 hover:scale-105"
      >
        {open ? <FiX size={22} /> : <FiMessageSquare size={22} />}
        {!open && conversations.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
            {conversations.length > 9 ? '9+' : conversations.length}
          </span>
        )}
      </button>

      {/* Slide-up drawer */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-40 w-80 rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden"
          style={{ maxHeight: '68vh', animation: 'fade-up 0.2s ease-out' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <span className="font-bold text-sm text-gray-900 dark:text-white">Messages</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">
              <FiX size={18} />
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(68vh - 49px)' }}>
            {loading ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                <FiMessageSquare size={26} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                No conversations yet
              </div>
            ) : (
              conversations.map((c) => {
                const other = c.agent_id === user.id ? c.buyer_name : c.agent_name;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveConv({ id: c.id, title: `${c.listing_title || 'Listing'} · ${other}` });
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 text-left border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors last:border-b-0"
                  >
                    {c.listing_image
                      ? <img src={c.listing_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-[#121212]/30 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-gray-900 dark:text-white">{c.listing_title || 'Listing'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{other} · {c.last_message || 'No messages yet'}</p>
                    </div>
                    {c.last_at && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">
                        {timeAgo(new Date(c.last_at).getTime())}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Full chat panel for the selected conversation */}
      {activeConv && (
        <ChatPanel
          conversationId={activeConv.id}
          title={activeConv.title}
          onClose={() => setActiveConv(null)}
        />
      )}
    </>
  );
};

export default FloatingChatDrawer;
