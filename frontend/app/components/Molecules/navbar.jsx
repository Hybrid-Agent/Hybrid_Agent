'use client';

import { CgProfile } from "react-icons/cg";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaBars, FaTimes } from 'react-icons/fa';
import { FiLogIn, FiUserPlus, FiLogOut, FiHome, FiInfo, FiMail, FiList, FiStar, FiAward, FiPieChart } from 'react-icons/fi';
import Setting from './Setting';
import NotificationBell from './NotificationBell';
import { useTheme } from '../Atoms/ThemeProvider';
import { useAuth } from '../Atoms/AuthProvider';
import { useNotifications } from '../Atoms/NotificationProvider';

const navLinks = [
  { href: "/", label: "Home", icon: FiHome },
  { href: "/LearnMore", label: "About", icon: FiInfo },
  { href: "/Contact", label: "Contact", icon: FiMail },
  { href: "/Listings", label: "Listings", icon: FiList },
  { href: "/Reviews", label: "Reviews", icon: FiStar },
  { href: "/Leaderboard", label: "Leaderboard", icon: FiAward },
];

const MobileNavLink = ({ href, label, icon: Icon, onClick }) => (
  <Link
    className='group flex items-center gap-4 px-6 py-4 text-[17px] font-medium border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-[#121212]/40 hover:text-teal-600 dark:hover:text-teal-400 transition-all duration-200'
    href={href}
    onClick={onClick}
  >
    {Icon && <Icon className="text-[22px] text-gray-400 dark:text-gray-500 group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors duration-200" />}
    <span className="tracking-wide">{label}</span>
  </Link>
);

const Navbar = () => {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { resolvedTheme } = useTheme();
  const { isLoggedIn, logout } = useAuth();
  const { flash } = useNotifications();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    flash('info', 'Signed out', 'You have been logged out.');
  };

  const closeNav = () => setNavOpen(false);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (navOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [navOpen]);

  const links = isLoggedIn ? [...navLinks, { href: '/Dashboard', label: 'Dashboard', icon: FiPieChart }] : navLinks;

  return (
    <>
      <header
        className={`fixed top-0 left-0 w-full z-40 flex justify-between items-center px-4 py-3 md:py-4 md:px-8 lg:px-12 xl:px-20 2xl:px-60 transition-all duration-300 ${
          scrolled || navOpen
            ? isDark
              ? 'bg-black/80 backdrop-blur-xl border-b border-gray-800/50 shadow-sm'
              : 'bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-sm'
            : 'bg-transparent border-transparent'
        }`}
      >
        <Link href="/" className="z-50 relative flex items-center">
          <span className={`text-xl md:text-3xl font-extrabold tracking-tighter cursor-pointer ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            <span className='text-teal-500'>HYBRID</span>
            AGENT
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className='hidden lg:flex space-x-8 font-semibold text-[15px]'>
          {links.map((link) => (
            <Link
              key={link.href}
              className={`relative hover:text-teal-600 transition-colors after:content-[''] after:absolute after:-bottom-1.5 after:left-0 after:w-0 after:h-[2px] after:bg-teal-500 after:transition-all hover:after:w-full ${
                isDark ? 'text-gray-200 hover:text-teal-400' : 'text-gray-600 hover:text-teal-600'
              }`}
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 z-50">
          {/* Desktop auth + settings */}
          <div className="hidden lg:flex items-center gap-4">
            {isLoggedIn ? (
              <>
                <NotificationBell />
                <Link href="/Profile" onClick={closeNav} aria-label="Profile" className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-[#1e1e1e] transition-colors">
                  <CgProfile
                    size={26}
                    className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                  />
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-white border border-red-500/50 hover:bg-red-500 hover:border-red-500 px-4 py-2 rounded-xl transition-all duration-300 shadow-sm hover:shadow-red-500/20"
                  aria-label="Log out"
                >
                  <FiLogOut size={16} />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/Login"
                  className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-300 ${
                    isDark ? 'text-gray-300 hover:text-white hover:bg-[#1e1e1e]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <FiLogIn size={16} />
                  Login
                </Link>
                <Link
                  href="/Registration"
                  className="flex items-center gap-2 text-sm font-semibold text-white bg-teal-500 hover:bg-teal-400 px-5 py-2 rounded-xl transition-all duration-300 shadow-lg shadow-teal-500/30 hover:shadow-teal-500/40 transform hover:-translate-y-0.5"
                >
                  <FiUserPlus size={16} />
                  Register
                </Link>
              </>
            )}
            <div className="pl-2 border-l border-gray-200 dark:border-gray-700 h-6 flex items-center">
              <Setting />
            </div>
          </div>

          {/* Mobile settings + toggle */}
          <div className='lg:hidden flex items-center gap-3'>
            {isLoggedIn && <NotificationBell />}
            <Setting />
            <button
              onClick={() => setNavOpen(!navOpen)}
              className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors focus:outline-none ${
                isDark ? 'text-white hover:bg-[#1e1e1e]' : 'text-gray-900 hover:bg-gray-100'
              }`}
              aria-label={navOpen ? "Close navigation" : "Open navigation"}
            >
              <div className="relative w-5 h-5">
                <span className={`absolute h-[2px] w-5 bg-current transform transition-all duration-300 ease-in-out ${navOpen ? 'rotate-45 top-2.5' : 'top-0'}`} />
                <span className={`absolute h-[2px] w-5 bg-current top-2.5 transition-all duration-200 ease-in-out ${navOpen ? 'opacity-0' : 'opacity-100'}`} />
                <span className={`absolute h-[2px] w-5 bg-current transform transition-all duration-300 ease-in-out ${navOpen ? '-rotate-45 top-2.5' : 'top-5'}`} />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <div 
        className={`lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          navOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeNav}
        aria-hidden="true"
      />

      <div
        className={`lg:hidden fixed top-0 right-0 h-[100dvh] w-[85%] max-w-[360px] z-40 transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col shadow-2xl ${
          navOpen ? 'translate-x-0' : 'translate-x-full'
        } ${isDark ? 'bg-[#0a0a0a] border-l border-gray-800/50' : 'bg-white border-l border-gray-100'}`}
      >
        <div className="flex-1 overflow-y-auto pt-24 pb-24 scrollbar-hide">
          <div className="flex flex-col">
            {links.map((link) => (
              <MobileNavLink key={link.href} href={link.href} label={link.label} icon={link.icon} onClick={closeNav} />
            ))}
          </div>

          <div className="mt-8 px-6 pb-6">
            <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Account</h3>
            <div className="flex flex-col gap-3">
              {isLoggedIn ? (
                <>
                  <Link href="/Profile" onClick={closeNav} className={`flex items-center gap-3 p-3.5 rounded-xl transition-colors ${
                    isDark ? 'bg-[#121212]/50 hover:bg-[#1e1e1e] text-gray-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                  }`}>
                    <CgProfile size={22} className="text-teal-500" />
                    <span className="font-medium">My Profile</span>
                  </Link>
                  <button
                    onClick={() => { handleLogout(); closeNav(); }}
                    className={`flex items-center gap-3 p-3.5 rounded-xl transition-colors text-red-500 ${
                      isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
                    }`}
                  >
                    <FiLogOut size={22} />
                    <span className="font-medium">Logout</span>
                  </button>
                </>
              ) : (
                <>
                  <Link href="/Login" onClick={closeNav} className={`flex justify-center items-center gap-2 p-3.5 rounded-xl font-semibold transition-colors border ${
                    isDark ? 'border-gray-700 text-gray-300 hover:bg-[#1e1e1e] hover:text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}>
                    <FiLogIn size={20} />
                    Login
                  </Link>
                  <Link href="/Registration" onClick={closeNav} className="flex justify-center items-center gap-2 p-3.5 rounded-xl font-semibold text-white bg-teal-500 hover:bg-teal-400 shadow-md shadow-teal-500/20 transition-all">
                    <FiUserPlus size={20} />
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Mobile footer area */}
        <div className={`absolute bottom-0 left-0 w-full p-6 text-center text-sm pointer-events-none ${
          isDark ? 'bg-[#0a0a0a]/90 text-gray-500' : 'bg-white/90 text-gray-400'
        }`}>
          &copy; {new Date().getFullYear()} HybridAgent
        </div>
      </div>
    </>
  );
};

export default Navbar;
