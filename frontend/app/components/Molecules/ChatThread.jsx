'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSend, FiAlertTriangle } from 'react-icons/fi';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { setActiveChat, clearActiveChat } from '@/lib/activeChat';
import { useAuth } from '../Atoms/AuthProvider';
import { Spinner } from '../Atoms/Loaders';

// Reusable live message thread + composer for a conversation. Used both by the
// slide-over ChatPanel and the dashboard two-pane chat.
const ChatThread = ({ conversationId, className = '' }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const topRef = useRef(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api.messages(conversationId, { limit: 50, before: nextCursor });
      setMessages((prev) => [...data.messages, ...prev]);
      setNextCursor(data.nextCursor);
    } catch {
      /* ignore */
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, nextCursor, loadingOlder]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    const socket = getSocket();
    setActiveChat(conversationId);
    setLoading(true);

    (async () => {
      try {
        const data = await api.messages(conversationId, { limit: 50 });
        if (active) { setMessages(data.messages); setNextCursor(data.nextCursor); scrollDown(); }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    })();

    const onNew = (m) => {
      if (m.conversation_id === conversationId) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        scrollDown();
      }
    };

    socket.emit('conversation:join', conversationId, () => {});
    socket.on('message:new', onNew);

    return () => {
      active = false;
      clearActiveChat(conversationId);
      socket.emit('conversation:leave', conversationId);
      socket.off('message:new', onNew);
    };
  }, [conversationId, scrollDown]);

  // Load older history when the thread is scrolled to the top.
  useEffect(() => {
    const node = topRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadOlder(); },
      { root, rootMargin: '80px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadOlder]);

  const send = (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    getSocket().emit('message:send', { conversationId, body }, (ack) => {
      setSending(false);
      if (ack?.ok) setText('');
    });
  };

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Safety advisory */}
      <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/15 border-b border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-300">
        <FiAlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <p className="text-[11px] leading-snug">Keep all chats &amp; payments on HybridAgent. If anything goes wrong, we can review this conversation. Never deal off-platform.</p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center pt-10 text-teal-500"><Spinner size={24} /></div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400 pt-10">No messages yet. Say hello 👋</p>
        ) : (
          <>
            <div ref={topRef} className="-mb-3">
              {loadingOlder && (
                <div className="flex justify-center py-2 text-teal-500"><Spinner size={18} /></div>
              )}
            </div>
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-teal-600 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white rounded-bl-sm'}`}>
                    {!mine && <p className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 mb-0.5">{m.sender_name}</p>}
                    <p className="break-words">{m.body}</p>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form onSubmit={send} className="p-3 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="flex-1 bg-gray-100 dark:bg-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-white"
        />
        <button type="submit" disabled={sending || !text.trim()} className="bg-teal-600 hover:bg-teal-500 text-white p-2.5 rounded-xl disabled:opacity-50 transition-colors">
          {sending ? <Spinner size={18} /> : <FiSend size={18} />}
        </button>
      </form>
    </div>
  );
};

export default ChatThread;
