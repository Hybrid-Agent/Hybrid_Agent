'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import HeroCards from '../components/Molecules/HeroCards';
import Slider from '../components/Molecules/Slider';
import FloatingChatDrawer from '../components/Molecules/FloatingChatDrawer';
import PaymentActivity from '../components/Molecules/PaymentActivity';
import { FaChevronDown } from 'react-icons/fa';
import { FiShield, FiGlobe, FiZap, FiLock, FiTrendingUp, FiClock, FiX, FiArrowRight } from 'react-icons/fi';
import { useTheme } from '../components/Atoms/ThemeProvider';
import { useAuth } from '../components/Atoms/AuthProvider';
import { api } from '@/lib/api';

const features = [
  { icon: FiShield, label: 'Secure Escrow' },
  { icon: FiGlobe, label: 'Global Reach' },
  { icon: FiZap, label: 'Instant Release' },
];

const stats = [
  { icon: FiLock, value: '100%', label: 'On-chain settlement' },
  { icon: FiTrendingUp, value: 'USDC', label: 'Stable payouts' },
  { icon: FiShield, value: '0', label: 'Commission disputes' },
];

const Label = ({ className = '', children }) => (
  <span className={`text-[10px] md:text-[11px] uppercase tracking-[0.22em] font-mono text-neutral-500 dark:text-neutral-400 ${className}`}>
    {children}
  </span>
);



const Hero = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <main className={`relative min-h-screen flex flex-col overflow-hidden pt-24 transition-colors duration-300 ${
      isDark ? 'bg-black text-white' : 'bg-neutral-50 text-neutral-900'
    }`}>
      {/* Crosshair guide lines */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-current opacity-[0.06]" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-current opacity-[0.06]" />
      </div>

      {/* Dotted texture */}
      <div className="absolute inset-0 bg-dot-grid text-neutral-400/30 dark:text-white/[0.05] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />

      {/* Editorial corner labels */}
      <Label className="absolute top-24 left-4 md:left-10">HybridAgent <span className="opacity-50">&#8600;</span></Label>
      <Label className="hidden md:block absolute top-24 left-1/2 -translate-x-1/2 text-center leading-relaxed">Restrained financial<br />visual language</Label>
      <span className="absolute top-24 right-4 md:right-10 text-[13px] font-mono text-neutral-400">&#169;</span>
      <Label className="absolute bottom-6 left-4 md:left-10">2026</Label>
      <Label className="hidden md:block absolute bottom-6 right-10">Property &middot; Vehicles</Label>

      {/* Main content */}
      <div className="relative z-10 flex-1 w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-10 px-4 md:px-10 lg:px-16 py-10 lg:py-0">
        <div className="w-full lg:w-1/2 animate-fade-up">
          <HeroCards />
        </div>
        <div className="w-full lg:w-1/2 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="ring-1 ring-neutral-200/60 dark:ring-white/10 rounded-2xl">
            <Slider />
          </div>
        </div>
      </div>

      {/* Trust stats band */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 mt-4 mb-4">
        <div className={`grid grid-cols-3 gap-3 rounded-2xl border p-4 backdrop-blur-sm ${
          isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white/70 border-neutral-200 shadow-sm'
        }`}>
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex flex-col items-center text-center gap-1">
              <Icon className="text-neutral-400 dark:text-neutral-300" size={18} />
              <span className="text-xl font-extrabold text-neutral-900 dark:text-white">{value}</span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment activity — only visible to logged-in buyers with active deals */}
      <div className="px-4">
        <PaymentActivity />
      </div>

      {/* Feature pills */}
      <div className="relative z-10 flex flex-wrap justify-center gap-3 px-4 pb-16">
        {features.map(({ icon: Icon, label }) => (
          <div key={label} className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
            isDark ? 'bg-white/[0.03] border-white/10 text-neutral-300' : 'bg-white border-neutral-200 text-neutral-600 shadow-sm'
          }`}>
            <Icon size={14} className="text-neutral-400 dark:text-neutral-300" />
            {label}
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-neutral-400 animate-bounce hidden md:block z-10">
        <FaChevronDown size={20} />
      </div>

      {/* Floating chat button + drawer */}
      <FloatingChatDrawer />
    </main>
  );
};

export default Hero;
