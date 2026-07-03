'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiAward } from 'react-icons/fi';
import { StarRating } from '../components/Atoms/StarRating';
import { Skeleton } from '../components/Atoms/Loaders';
import { api } from '@/lib/api';

const ReviewPage = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.recentReviews()
      .then((data) => active && setReviews(data))
      .catch(() => active && setReviews([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white transition-colors duration-300 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto animate-fade-up">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-teal-600 dark:text-teal-500 mb-3">Agent Reviews</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Honest reviews of agents — rated on communication and professionalism by people they've actually dealt with.</p>
          {!loading && reviews.length > 0 && (
            <div className="inline-flex items-center gap-3 bg-teal-50 dark:bg-[#121212]/20 border border-teal-200 dark:border-teal-800 rounded-2xl px-6 py-3">
              <span className="text-4xl font-extrabold text-teal-600 dark:text-teal-400">{avg}</span>
              <div className="text-left">
                <StarRating value={Math.round(parseFloat(avg))} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{reviews.length} recent reviews</p>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-20">
            <FiAward size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No reviews yet. Chat with an agent on a listing, then leave the first review.</p>
            <Link href="/Listings" className="inline-block mt-4 text-teal-600 dark:text-teal-400 hover:underline text-sm font-semibold">Browse listings →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((r) => (
              <div key={r.id} className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-teal-400 dark:hover:border-teal-700 transition-all duration-300">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <img src={r.reviewer_avatar} alt={r.reviewer_name} className="w-11 h-11 rounded-full border-2 border-teal-500" loading="lazy" />
                    <div>
                      <h4 className="font-bold text-sm">{r.reviewer_name}</h4>
                      <p className="text-xs text-gray-400">reviewed <span className="text-teal-600 dark:text-teal-400 font-medium">{r.agent_name}</span></p>
                    </div>
                  </div>
                  <StarRating value={r.rating} />
                </div>
                {r.comment && <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-3">{r.comment}</p>}
                <div className="flex gap-2 flex-wrap">
                  {r.communication != null && <Chip label="Communication" value={r.communication} />}
                  {r.professionalism != null && <Chip label="Professionalism" value={r.professionalism} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Chip = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-teal-50 dark:bg-[#121212]/20 text-teal-700 dark:text-teal-300 px-2 py-1 rounded-full">
    {label} · {value}/5
  </span>
);

export default ReviewPage;
