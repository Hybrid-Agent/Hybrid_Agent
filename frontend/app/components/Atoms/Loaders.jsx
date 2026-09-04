'use client';

import React from 'react';

// Circular spinner. `size` in px, inherits text color via currentColor.
export const Spinner = ({ size = 20, className = '' }) => (
  <svg
    className={`animate-spin ${className}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-label="Loading"
    role="status"
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// Three bouncing dots — for buttons / inline "working" states.
export const Dots = ({ className = '' }) => (
  <span className={`inline-flex items-center gap-1 ${className}`}>
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="w-1.5 h-1.5 rounded-full bg-current animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
);

// Skeleton block with a shimmer sweep.
export const Skeleton = ({ className = '' }) => (
  <div className={`shimmer bg-gray-200 dark:bg-white/10 rounded-lg ${className}`} />
);

// Branded full-page loader with a premium single loading effect.
export const PageLoader = ({ label = 'Loading' }) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
    <div className="relative w-20 h-20 flex items-center justify-center">
      {/* Soft glowing background pulse */}
      <div className="absolute inset-0 bg-teal-500/20 blur-xl rounded-full animate-pulse"></div>
      
      {/* Sleek spinning indicator ring */}
      <div className="absolute inset-0 border-4 border-transparent border-t-teal-500/80 border-r-teal-500/30 rounded-full animate-spin"></div>
      
      {/* Central premium logo mark */}
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center font-extrabold text-xl shadow-xl relative z-10">
        H
      </div>
    </div>
    <p className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400 animate-pulse">
      {label}
    </p>
  </div>
);

export default Spinner;
