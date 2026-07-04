"use client";
import React from 'react';
import Link from 'next/link';
import { useTheme } from '../Atoms/ThemeProvider';

const HeroCards = () => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className={`flex flex-col justify-center items-center md:items-start text-center md:text-start ${
      isDark ? 'text-white' : 'text-gray-900'
    }`}>
      <div className="w-full">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 ${
          isDark ? 'bg-[#121212]/40 text-teal-300' : 'bg-teal-50 text-teal-700'
        }`}>
          Now live~Early access
        </div>

        <div className='font-mono'>
          <h1 className='text-4xl sm:text-5xl lg:text-5xl xl:text-6xl font-extrabold pb-4 md:pb-6 leading-tight'>
            <span className='text-teal-600'>HYBRID</span>
            <span className={isDark ? 'text-white' : 'text-gray-900'}>AGENT</span>
          </h1>
          <div className="text-lg sm:text-xl md:text-2xl leading-relaxed space-y-2">
            <p className={isDark ? 'text-gray-200' : 'text-gray-600'}>
              A highly secure way to receive commissions{' '}
              <b className='text-teal-500'>LOCALLY</b> &{' '}
              <b className='text-teal-500'>INTERNATIONALLY</b>
            </p>
            <p className={`text-base sm:text-lg ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              on property &amp; vehicle sales — fast and easy.
            </p>
          </div>
        </div>

        <div className='mt-8 flex flex-col sm:flex-row items-center md:items-start gap-3'>
          <Link
            href="/Registration"
            className="bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white transition-all font-bold py-3 px-8 w-full sm:w-auto rounded-xl shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30"
          >
            Get Started
          </Link>
          <Link
            href="/LearnMore"
            className={`transition-all font-bold py-3 px-8 w-full sm:w-auto rounded-xl border ${
              isDark
                ? 'border-gray-600 text-gray-200 hover:bg-white/10 hover:border-gray-400'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
            }`}
          >
            Learn More
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HeroCards;
