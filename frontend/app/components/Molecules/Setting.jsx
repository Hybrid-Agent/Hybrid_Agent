'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FiSettings } from 'react-icons/fi';
import { useTheme } from '../Atoms/ThemeProvider';

const Setting = () => {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const wrapperRef = useRef(null);

  const toggleOpen = (e) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  return (
    <div className="relative flex items-center justify-center" ref={wrapperRef}>
      <button
        onClick={toggleOpen}
        className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-[#1e1e1e] text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
        aria-label="Open settings"
      >
        <FiSettings size={22} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-11 w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 shadow-xl p-4 text-sm text-gray-900 dark:text-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Settings</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Customize your experience</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-medium text-sm">Theme</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isDark ? 'Dark mode' : 'Light mode'}
              </span>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isDark ? 'bg-teal-600' : 'bg-gray-300'
              }`}
              aria-label="Toggle dark mode"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                  isDark ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Setting;
