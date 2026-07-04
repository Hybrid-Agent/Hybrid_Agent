'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiUser, FiAtSign, FiPhone, FiMail, FiEdit, FiUsers, FiHeart, FiLock,
  FiArrowRight, FiArrowLeft, FiCheck, FiShield,
} from 'react-icons/fi';
import { useAuth } from '../components/Atoms/AuthProvider';
import { useNotifications } from '../components/Atoms/NotificationProvider';
import { Spinner } from '../components/Atoms/Loaders';

const STEPS = [
  { id: 'account', title: 'Account', subtitle: 'How should we call you?' },
  { id: 'contact', title: 'Contact', subtitle: 'Where can we reach you?' },
  { id: 'role', title: 'Your role', subtitle: 'Tell us who you are' },
  { id: 'security', title: 'Security', subtitle: 'Secure your account' },
];

const RegistrationPage = () => {
  const router = useRouter();
  const { register, isLoggedIn, loading } = useAuth();
  const notifications = useNotifications();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    fullName: '', userName: '', phoneNumber: '', email: '',
    userType: 'agent', gender: '', bio: '', password: '', confirmPassword: '',
  });

  useEffect(() => {
    if (!loading && isLoggedIn) router.push('/Profile');
  }, [loading, isLoggedIn, router]);

  const setField = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: undefined }));
  };

  const validateStep = (i) => {
    const e = {};
    if (i === 0) {
      if (!form.fullName.trim()) e.fullName = 'Full name is required.';
      if (!form.userName.trim()) e.userName = 'Username is required.';
      else if (!/^[a-zA-Z0-9]{3,}$/.test(form.userName)) e.userName = 'Min 3 letters/numbers, no spaces.';
    }
    if (i === 1) {
      if (!form.email) e.email = 'Email is required.';
      else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email is invalid.';
      if (!form.phoneNumber) e.phoneNumber = 'Phone number is required.';
      else if (!/^\+?[1-9]\d{1,14}$/.test(form.phoneNumber)) e.phoneNumber = 'Use international format, e.g. +234…';
    }
    if (i === 2) {
      if (!form.userType) e.userType = 'Please choose a role.';
      if (!form.gender) e.gender = 'Please select a gender.';
    }
    if (i === 3) {
      if (!form.password) e.password = 'Password is required.';
      else if (form.password.length < 6) e.password = 'At least 6 characters.';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };
  const back = () => step > 0 && setStep(step - 1);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { confirmPassword, ...payload } = form;
      const user = await register(payload);
      notifications.success('Welcome to HybridAgent!', `Your account and wallet are ready, ${user.full_name.split(' ')[0]}.`);
      setTimeout(() => router.push('/Profile'), 600);
    } catch (err) {
      notifications.error('Registration failed', err.message);
      setSubmitting(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); next(); }
  };

  const inputClass = (field) =>
    `w-full pl-10 border bg-gray-50 dark:bg-[#121212]/50 text-gray-900 dark:text-gray-200 outline-none p-3 rounded-xl focus:ring-2 focus:ring-teal-500 transition-all ${
      errors[field] ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
    }`;
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1';
  const iconClass = 'absolute left-3 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400';
  const Err = ({ name }) => (errors[name] ? <p className="text-red-500 text-xs mt-1">{errors[name]}</p> : null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black dark:bg-[url('/bgttt.avif')] bg-cover bg-center pt-24 pb-12 px-4 transition-colors duration-300">
      <div className="w-full max-w-xl">
        <div className="bg-white/60 dark:bg-black/60 backdrop-blur-xl rounded-3xl shadow-xl dark:shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
          {/* Header + progress */}
          <div className="px-8 pt-8 pb-6 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-2xl font-bold text-teal-600 dark:text-teal-500">Create your account</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{STEPS[step].subtitle}</p>

            {/* Stepper */}
            <div className="flex items-center mt-6">
              {STEPS.map((s, i) => (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                        i < step
                          ? 'bg-teal-600 text-white'
                          : i === step
                          ? 'bg-teal-600 text-white ring-4 ring-teal-500/20 scale-110'
                          : 'bg-gray-100 dark:bg-white/10 text-gray-400'
                      }`}
                    >
                      {i < step ? <FiCheck size={16} /> : i + 1}
                    </div>
                    <span className={`text-[11px] mt-1.5 font-medium hidden sm:block ${i <= step ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>
                      {s.title}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-1.5 -mt-4 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                      <div className={`h-full bg-teal-600 transition-all duration-500 ${i < step ? 'w-full' : 'w-0'}`} />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step body */}
          <div className="px-8 py-7 min-h-[260px]" onKeyDown={onKeyDown}>
            <div key={step} className="animate-fade-up space-y-4">
              {step === 0 && (
                <>
                  <div>
                    <label className={labelClass}>Full name</label>
                    <div className="relative">
                      <span className={iconClass}><FiUser /></span>
                      <input name="fullName" value={form.fullName} onChange={setField} placeholder="Jane Doe" className={inputClass('fullName')} autoFocus />
                    </div>
                    <Err name="fullName" />
                  </div>
                  <div>
                    <label className={labelClass}>Username</label>
                    <div className="relative">
                      <span className={iconClass}><FiAtSign /></span>
                      <input name="userName" value={form.userName} onChange={setField} placeholder="janedoe" className={inputClass('userName')} />
                    </div>
                    <Err name="userName" />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div>
                    <label className={labelClass}>Email</label>
                    <div className="relative">
                      <span className={iconClass}><FiMail /></span>
                      <input name="email" type="email" value={form.email} onChange={setField} placeholder="you@example.com" className={inputClass('email')} autoFocus />
                    </div>
                    <Err name="email" />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <div className="relative">
                      <span className={iconClass}><FiPhone /></span>
                      <input name="phoneNumber" type="tel" value={form.phoneNumber} onChange={setField} placeholder="+234 801 234 5678" className={inputClass('phoneNumber')} />
                    </div>
                    <Err name="phoneNumber" />
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <label className={labelClass}>I am an</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { v: 'agent', t: 'Agent', d: 'I sell for others & earn commission' },
                        { v: 'owner', t: 'Owner', d: 'I sell my own property/vehicle' },
                      ].map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, userType: o.v }))}
                          className={`text-left p-4 rounded-xl border-2 transition-all ${
                            form.userType === o.v
                              ? 'border-teal-500 bg-teal-50 dark:bg-[#121212]/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-teal-300'
                          }`}
                        >
                          <span className="block text-sm font-bold text-gray-900 dark:text-white">{o.t}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{o.d}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Gender</label>
                    <div className="relative">
                      <span className={iconClass}><FiHeart /></span>
                      <select name="gender" value={form.gender} onChange={setField} className={inputClass('gender') + ' appearance-none'}>
                        <option value="">Select gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <Err name="gender" />
                  </div>
                  <div>
                    <label className={labelClass}>About you <span className="text-gray-400">(optional)</span></label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-teal-600 dark:text-teal-400"><FiEdit /></span>
                      <textarea name="bio" value={form.bio} onChange={setField} rows={2} placeholder="A short bio…" className={inputClass('bio') + ' resize-none'} />
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <label className={labelClass}>Password</label>
                    <div className="relative">
                      <span className={iconClass}><FiLock /></span>
                      <input name="password" type="password" value={form.password} onChange={setField} placeholder="Min. 6 characters" className={inputClass('password')} autoFocus />
                    </div>
                    <Err name="password" />
                  </div>
                  <div>
                    <label className={labelClass}>Confirm password</label>
                    <div className="relative">
                      <span className={iconClass}><FiLock /></span>
                      <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={setField} placeholder="Repeat password" className={inputClass('confirmPassword')} />
                    </div>
                    <Err name="confirmPassword" />
                  </div>
                  <div className="flex items-start gap-2.5 mt-2 p-3 rounded-xl bg-teal-50 dark:bg-[#121212]/15 border border-teal-100 dark:border-teal-900/40">
                    <FiShield className="text-teal-500 flex-shrink-0 mt-0.5" size={16} />
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      A secure wallet is created for you automatically — no seed phrase to manage.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer nav */}
          <div className="px-8 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={step === 0 || submitting}
              className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-0 transition-colors"
            >
              <FiArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={submitting}
              className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-semibold py-2.5 px-6 rounded-xl disabled:opacity-70 transition-colors min-w-[130px] justify-center"
            >
              {submitting ? (
                <Spinner size={18} />
              ) : step === STEPS.length - 1 ? (
                <>Create account <FiCheck size={16} /></>
              ) : (
                <>Continue <FiArrowRight size={16} /></>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-5">
          Already registered?{' '}
          <Link href="/Login" className="text-teal-600 dark:text-teal-400 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default RegistrationPage;
