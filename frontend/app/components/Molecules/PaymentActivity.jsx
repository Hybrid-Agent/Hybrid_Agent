'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiShield, FiClock, FiArrowRight, FiX } from 'react-icons/fi';
import { useAuth } from '../Atoms/AuthProvider';
import { useTheme } from '../Atoms/ThemeProvider';
import { api } from '@/lib/api';

// Payment activity card — shown for logged-in buyers with active purchase requests.
export default function PaymentActivity() {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [requests, setRequests] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.myPurchaseRequests().then(setRequests).catch(() => {});
  }, [user]);

  if (!user || dismissed || !requests?.length) return null;

  const toFund = requests.filter((r) => r.status === 'deal_created');
  const pending = requests.filter((r) => r.status === 'requested');

  if (!toFund.length && !pending.length) return null;

  return (
    <div className="relative z-10 w-full max-w-4xl mx-auto mb-4">
      <div className={`rounded-2xl border p-4 ${
        isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white/80 border-neutral-200 shadow-sm'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-gray-900 dark:text-white">Payment activity</span>
          <button
            onClick={() => setDismissed(true)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Dismiss"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {toFund.map((r) => (
            <Link
              key={r.id}
              href={`/Listings/${r.listing_id}`}
              className={`flex items-center gap-3 rounded-xl p-3 border transition-colors group ${
                isDark
                  ? 'bg-[#121212]/20 border-teal-800/50 hover:border-teal-600'
                  : 'bg-teal-50 border-teal-200 hover:border-teal-400'
              }`}
            >
              {r.listing_image
                ? <img src={r.listing_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-teal-200 dark:bg-white/5 backdrop-blur-md border border-white/10/50 flex-shrink-0 flex items-center justify-center"><FiShield className="text-teal-600 dark:text-teal-400" size={16} /></div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wide">Fund escrow</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.listing_title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Deal #{r.deal_id} · {Number(r.price_usdc).toLocaleString()} USDC ready</p>
              </div>
              <FiArrowRight size={16} className="text-teal-500 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}

          {pending.map((r) => (
            <Link
              key={r.id}
              href={`/Listings/${r.listing_id}`}
              className={`flex items-center gap-3 rounded-xl p-3 border transition-colors group ${
                isDark
                  ? 'bg-white/[0.03] border-white/10 hover:border-white/20'
                  : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {r.listing_image
                ? <img src={r.listing_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-10 h-10 rounded-lg bg-neutral-200 dark:bg-white/10 flex-shrink-0 flex items-center justify-center"><FiClock className="text-neutral-500 dark:text-neutral-400" size={16} /></div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Awaiting agent</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.listing_title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{Number(r.price_usdc).toLocaleString()} USDC · escrow being prepared</p>
              </div>
              <FiArrowRight size={16} className="text-neutral-400 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
