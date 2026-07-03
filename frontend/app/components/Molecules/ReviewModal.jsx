'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiMessageSquare } from 'react-icons/fi';
import { StarRating } from '../Atoms/StarRating';
import { Spinner } from '../Atoms/Loaders';
import { useNotifications } from '../Atoms/NotificationProvider';
import { api } from '@/lib/api';

// Rate an agent on overall + communication + professionalism, with a comment.
const ReviewModal = ({ agentId, agentName, onClose, onDone }) => {
  const notifications = useNotifications();
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ rating: 0, communication: 0, professionalism: 0, comment: '' });

  useEffect(() => {
    let active = true;
    api.reviewEligibility(agentId)
      .then((res) => {
        if (!active) return;
        setEligible(res.canReview);
        if (res.existing) {
          setForm({
            rating: res.existing.rating || 0,
            communication: res.existing.communication || 0,
            professionalism: res.existing.professionalism || 0,
            comment: res.existing.comment || '',
          });
        }
      })
      .catch(() => active && setEligible(false))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [agentId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) return notifications.error('Add a rating', 'Pick an overall star rating first.');
    setSubmitting(true);
    try {
      const res = await api.createReview({ agentId, ...form });
      notifications.success('Review submitted', `Thanks for rating ${agentName}.`);
      onDone?.(res);
      onClose();
    } catch (err) {
      notifications.error('Could not submit', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const Field = ({ label, name }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <StarRating value={form[name]} size={22} onChange={(n) => setForm((p) => ({ ...p, [name]: n }))} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold">Review {agentName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white"><FiX size={22} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size={26} className="text-teal-500" /></div>
        ) : !eligible ? (
          <div className="p-8 text-center">
            <FiMessageSquare size={30} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">You can review an agent once you've chatted with them on-platform. Start a conversation first.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <div className="flex flex-col items-center gap-2 pb-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Overall</span>
              <StarRating value={form.rating} size={30} onChange={(n) => setForm((p) => ({ ...p, rating: n }))} />
            </div>
            <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
              <Field label="Communication" name="communication" />
              <Field label="Professionalism" name="professionalism" />
            </div>
            <textarea
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              rows={3}
              maxLength={1000}
              placeholder="Share how the agent communicated and handled the deal…"
              className="w-full bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-700 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
            <button type="submit" disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-teal-600 text-white font-semibold py-3 rounded-xl disabled:opacity-60 transition-colors">
              {submitting ? <Spinner size={20} /> : 'Submit review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ReviewModal;
