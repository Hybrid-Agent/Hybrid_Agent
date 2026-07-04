'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FiMail, FiLock } from 'react-icons/fi';
import { useAuth } from '../components/Atoms/AuthProvider';
import { useNotifications } from '../components/Atoms/NotificationProvider';
import { Spinner } from '../components/Atoms/Loaders';

const LoginPage = () => {
  const router = useRouter();
  const { login, isLoggedIn, loading } = useAuth();
  const notifications = useNotifications();
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isLoggedIn) router.push('/Profile');
  }, [loading, isLoggedIn, router]);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      notifications.success('Welcome back!', `Signed in as ${user.full_name}.`);
      router.push('/Profile');
    } catch (err) {
      notifications.error('Login failed', err.message);
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full pl-10 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-transparent text-gray-900 dark:text-gray-200 outline-none p-3 rounded-xl focus:ring-2 focus:ring-teal-500 transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black dark:bg-[url('/bgttt.avif')] bg-cover bg-center py-12 px-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white/60 dark:bg-black/60 backdrop-blur-xl rounded-3xl shadow-xl dark:shadow-2xl p-8 sm:p-10 border border-black/10 dark:border-white/10 animate-fade-up">
        <h3 className="text-2xl md:text-3xl text-center font-bold text-teal-600 dark:text-teal-500 mb-2">Welcome back</h3>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-8">Sign in to continue to your account.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">Email</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400"><FiMail /></span>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required className={inputClass} placeholder="you@example.com" />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">Password</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400"><FiLock /></span>
              <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required className={inputClass} placeholder="••••••••" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold p-3 rounded-xl disabled:opacity-70 transition-colors"
          >
            {submitting ? <Spinner size={20} /> : 'Sign in'}
          </button>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don&apos;t have an account?{' '}
            <Link href="/Registration" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">Register here</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
