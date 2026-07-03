'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { FiSearch, FiHome, FiTruck, FiPlusCircle, FiShield } from 'react-icons/fi';
import { useAuth } from '../components/Atoms/AuthProvider';
import { Skeleton } from '../components/Atoms/Loaders';
import { api } from '@/lib/api';

const StatusBadge = ({ status }) => (
  <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
    status === 'sold'
      ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'
      : status === 'pending'
      ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
      : 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300'
  }`}>
    {status === 'open' ? 'Available' : status}
  </span>
);

const ListingCard = ({ item }) => (
  <Link href={`/Listings/${item.id}`} className="block group">
    <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 group-hover:border-teal-400 dark:group-hover:border-teal-600 rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 shadow-sm hover:shadow-md dark:shadow-none">
      <div className="relative overflow-hidden h-48">
        {item.image ? (
          <img src={item.image} alt={item.title} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-48 bg-teal-100 dark:bg-[#121212]/30 flex items-center justify-center text-teal-300 dark:text-teal-700">
            {item.asset_type === 'vehicle' ? <FiTruck size={40} /> : <FiHome size={40} />}
          </div>
        )}
        <div className="absolute top-2 right-2"><StatusBadge status={item.status} /></div>
      </div>
      <div className="p-4">
        <h3 className="text-base font-bold text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{item.title}</h3>
        {item.agent_name && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1 truncate">
            by {item.agent_name}
            {item.agent_kyc === 'verified' && <FiShield size={11} className="text-teal-500" title="Verified agent" />}
          </p>
        )}
        <p className="text-teal-600 dark:text-teal-400 font-semibold mt-2 text-sm">{item.price_usdc} USDC</p>
      </div>
    </div>
  </Link>
);

const ListingsPage = () => {
  const { isLoggedIn } = useAuth();
  const [activeView, setActiveView] = useState('property');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.listings(`?assetType=${activeView}`)
      .then((data) => active && setItems(data))
      .catch(() => active && setItems([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [activeView]);

  const filtered = items.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className='bg-white dark:bg-black text-gray-900 dark:text-white transition-colors duration-300 pt-24 pb-20 min-h-screen'>
      <div className='max-w-7xl mx-auto px-4 md:px-8 lg:px-12 xl:px-16'>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className='text-3xl font-extrabold mb-1'>Listings</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Browse properties and vehicles from verified agents. Fixed prices — what you see is what you pay.</p>
          </div>
          {isLoggedIn && (
            <Link href="/Dashboard" className="flex items-center gap-2 bg-white/10 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap">
              <FiPlusCircle size={16} /> List an item
            </Link>
          )}
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/10 rounded-xl w-fit">
            {[{ v: 'property', t: 'Properties', Icon: FiHome }, { v: 'vehicle', t: 'Vehicles', Icon: FiTruck }].map(({ v, t, Icon }) => (
              <button key={v} onClick={() => { setActiveView(v); setSearch(''); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeView === v ? 'bg-white dark:bg-white/20 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                <Icon size={15} /> {t}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${activeView === 'property' ? 'properties' : 'vehicles'}…`}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-teal-500 transition-colors" />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((item) => <ListingCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-400 text-lg">
              {search ? `No listings found for "${search}"` : `No ${activeView === 'property' ? 'properties' : 'vehicles'} listed yet.`}
            </p>
            {isLoggedIn && !search && (
              <Link href="/Dashboard" className="inline-block mt-4 text-teal-600 dark:text-teal-400 hover:underline text-sm font-semibold">Be the first to list one →</Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ListingsPage;
