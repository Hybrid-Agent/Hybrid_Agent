import React from 'react';
import Link from 'next/link';
import { FiShield, FiGlobe, FiZap, FiCheckCircle, FiArrowRight, FiLock, FiUsers, FiDollarSign } from 'react-icons/fi';

const features = [
  { icon: FiShield, title: 'Secure Escrow', description: 'The buyer funds the full price into a smart contract. Commission is carved out automatically — the seller cannot be paid without the agent being paid first.' },
  { icon: FiZap, title: 'Instant Payout', description: 'On confirmation, the contract splits funds in one atomic transaction. Agents receive commission in USDC the moment a deal completes.' },
  { icon: FiGlobe, title: 'Global & On-chain', description: 'Settle in USDC anywhere in the world. No borders, no banks needed to enforce trust — the contract is the guarantee.' },
];

const steps = [
  { n: 1, title: 'List the asset', body: 'An owner lists directly, or grants an agent an on-chain mandate to broker the sale for an agreed commission.' },
  { n: 2, title: 'Buyer funds escrow', body: 'The buyer deposits the full price in USDC into the escrow contract — protected for everyone.' },
  { n: 3, title: 'Deal completes', body: 'On confirmation, funds split automatically: agent commission, platform fee, and the rest to the seller.' },
];

const benefits = [
  'No more commission disputes',
  'Full transaction transparency',
  'Settled in stable USDC',
  'Supports properties and vehicles',
  'Zero hidden fees',
  'Built for independent agents',
];

const stats = [
  { icon: FiLock, value: '100%', label: 'On-chain settlement' },
  { icon: FiDollarSign, value: 'USDC', label: 'Stable payouts' },
  { icon: FiUsers, value: '2-sided', label: 'Owners & agents' },
];

const img = (id) => `https://images.unsplash.com/photo-${id}?w=500&h=420&fit=crop&auto=format&q=80`;
const galleryA = [img('1600596542815-ffad4c1539a9'), img('1503376780353-7e6692767b70'), img('1613490493576-7fde63acd811')];
const galleryB = [img('1552519507-da3b142c6e3d'), img('1600585154340-be6161a56a0c'), img('1618843479313-40f8afb4b4d8')];

const LearnMorePage = () => {
  return (
    <main className='min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white transition-colors duration-300 py-20 pt-32 md:pt-40 px-4 sm:px-8 md:px-16 lg:px-20'>
      <div className="max-w-7xl mx-auto">

        {/* Hero */}
        <div className="relative flex flex-col lg:flex-row justify-center items-center gap-16 lg:gap-20 mb-24">
          <div className='relative w-full lg:w-3/5 text-center lg:text-left animate-fade-up'>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 bg-teal-50 dark:bg-[#121212]/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
              About HybridAgent
            </div>
            <h1 className="text-3xl md:text-5xl pb-4 font-extrabold leading-tight">
              Why <span className="text-teal-600 dark:text-teal-500">HYBRID</span>Agent?
            </h1>
            <p className="text-base md:text-lg leading-relaxed text-gray-600 dark:text-gray-300">
              In property and vehicle markets, selling agents are dangerously exposed to commission
              fraud — they do the work, the deal closes, and payment never comes. HybridAgent fixes this
              with on-chain escrow: the buyer's payment settles through a smart contract that releases the
              agent's commission automatically the moment a sale is confirmed.
            </p>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-gray-500 dark:text-gray-400">
              It's a free, two-sided market — owners can sell directly (no commission), and agents can sell
              on others' behalf (commission guaranteed) — built borderless on USDC so it works for everyone,
              everywhere.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link href="/Registration" className="inline-flex items-center justify-center gap-2 bg-teal-700 hover:bg-teal-600 dark:bg-white/10 dark:hover:bg-teal-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-teal-900/20 transition-all">
                Get started <FiArrowRight size={16} />
              </Link>
              <Link href="/Listings" className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 hover:border-teal-500 font-bold py-3 px-8 rounded-xl transition-all">
                Browse listings
              </Link>
            </div>
          </div>

          <div className='relative w-full lg:w-2/5 flex justify-center animate-fade-up' style={{ animationDelay: '120ms' }}>
            <div className="relative w-full max-w-sm h-[420px] md:h-[480px] [perspective:1200px]">
              {/* Tilted twin-column photo stream */}
              <div className="grid grid-cols-2 gap-3 h-full [transform:rotateX(8deg)_rotateZ(-4deg)] [transform-style:preserve-3d]">
                <div className="overflow-hidden rounded-3xl">
                  <div className="flex flex-col gap-3 animate-marquee-up">
                    {[...galleryA, ...galleryA].map((src, i) => (
                      <img key={i} src={src} alt="Property or vehicle for sale" loading="lazy"
                        className="w-full h-40 object-cover rounded-2xl shadow-lg border border-white/40 dark:border-white/10" />
                    ))}
                  </div>
                </div>
                <div className="overflow-hidden rounded-3xl mt-6">
                  <div className="flex flex-col gap-3 animate-marquee-down">
                    {[...galleryB, ...galleryB].map((src, i) => (
                      <img key={i} src={src} alt="Property or vehicle for sale" loading="lazy"
                        className="w-full h-40 object-cover rounded-2xl shadow-lg border border-white/40 dark:border-white/10" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Edge fades */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white dark:from-black to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white dark:from-black to-transparent" />

              {/* Floating glass badge */}
              <div className="absolute top-1/2 -translate-y-1/2 -left-4 sm:-left-6 flex items-center gap-2 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md border border-white/60 dark:border-white/10 shadow-xl rounded-2xl px-3.5 py-2.5 animate-float">
                <span className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-[#121212]/40 flex items-center justify-center">
                  <FiShield className="text-teal-600 dark:text-teal-400" size={18} />
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-bold text-gray-900 dark:text-white">Commission</p>
                  <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">secured ✓</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats band */}
        <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto mb-24">
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 text-center">
              <Icon className="text-teal-500 mx-auto mb-2" size={20} />
              <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="mb-24">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">
            What makes it <span className="text-teal-600 dark:text-teal-500">safe</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:border-teal-500 dark:hover:border-teal-600 transition-all duration-300 hover:-translate-y-1">
                <div className="w-12 h-12 bg-teal-100 dark:bg-[#121212]/40 rounded-xl flex items-center justify-center mb-4">
                  <Icon size={24} className="text-teal-600 dark:text-teal-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How it works — timeline */}
        <div className="mb-24">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            How it <span className="text-teal-600 dark:text-teal-500">works</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6 relative">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="relative bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
                <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-extrabold mb-4">{n}</div>
                <h3 className="font-bold mb-1.5">{title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-teal-50 dark:bg-[#121212]/10 border border-teal-100 dark:border-teal-900/30 rounded-3xl p-8 md:p-10 mb-16">
          <h2 className="text-xl md:text-2xl font-bold mb-6">Everything you need, nothing you don't</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <FiCheckCircle size={18} className="text-teal-500 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300 text-sm font-medium">{benefit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-teal-700 dark:bg-white/5 border border-teal-800 dark:border-white/10 rounded-3xl p-10 md:p-14 text-white">
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">Get paid what you earned.</h2>
          <p className="text-teal-100 mb-7 max-w-xl mx-auto">Join HybridAgent and let the contract guarantee your commission — locally and across borders.</p>
          <Link href="/Registration" className="inline-flex items-center gap-2 bg-white text-teal-700 font-bold py-3 px-8 rounded-xl hover:bg-teal-50 transition-colors">
            Create your account <FiArrowRight size={16} />
          </Link>
        </div>
      </div>
    </main>
  );
};

export default LearnMorePage;
