'use client';
import React, { useState } from 'react';
import { MdSupportAgent, MdOutlineAutoFixHigh } from "react-icons/md";
import { TbHelpTriangle } from "react-icons/tb";
import { FiChevronDown, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';

const faqs = [
  {
    question: "How do I register as an agent?",
    answer: "Click 'Get Started' on the homepage or go to the Registration page. Fill out the required details and your account will be created instantly.",
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We use state-of-the-art encryption and security protocols to ensure that all your personal and transactional data is kept safe and confidential.",
  },
  {
    question: "How do I receive my commission?",
    answer: "Commissions are paid out directly to your registered bank account or preferred payment method. You can track all your earnings from your agent dashboard.",
  },
  {
    question: "What are the fees for using HybridAgent?",
    answer: "We have a transparent fee structure. A small percentage is deducted from each commission payout. There are no hidden charges or monthly subscription fees.",
  },
  {
    question: "Can I list both properties and vehicles?",
    answer: "Yes! HybridAgent supports listings for both real estate properties and vehicles. You can manage all listings from a single account dashboard.",
  },
  {
    question: "How long does commission release take?",
    answer: "Once a sale is verified, commission release is automatic and near-instant — typically within minutes of confirmation.",
  },
];

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 py-4">
      <button
        className="w-full flex justify-between items-center text-left text-gray-900 dark:text-gray-200"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="font-semibold text-sm sm:text-base pr-4">{question}</span>
        <FiChevronDown className={`flex-shrink-0 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="mt-3 text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
};

const ContactPage = () => {
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredFaqs = faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase())
  );

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      toast.error('Please fill in all fields.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setFormData({ name: '', email: '', message: '' });
      toast.success('Message sent! We\'ll be in touch soon.');
    }, 1000);
  };

  const inputClass = 'mt-1 block w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm bg-white dark:bg-[#121212]/50 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors text-sm';

  return (
    <div className='min-h-screen bg-white dark:bg-black transition-colors duration-300 pt-28 md:pt-36 pb-20'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-20'>

        {/* Header */}
        <div className='text-center w-full flex flex-col justify-center items-center mb-14'>
          <h2 className='text-3xl md:text-4xl font-bold mb-3 text-teal-600 dark:text-teal-500'>Contact Us</h2>
          <p className='text-base text-gray-600 dark:text-gray-300 max-w-xl'>
            Have questions? Search our FAQs or reach out to our support team.
          </p>
          <div className="mt-6 relative w-full max-w-xl">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search FAQs...'
              className='border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white bg-gray-50 dark:bg-[#121212]/50 p-3 pl-11 w-full rounded-full outline-none focus:ring-2 focus:ring-teal-500 transition-all text-sm'
            />
          </div>
        </div>

        {/* Support cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-16'>
          {[
            {
              icon: <TbHelpTriangle className='w-9 h-9 text-teal-700 dark:text-teal-500 mb-4' />,
              title: 'Report an Issue',
              desc: 'Found a bug? Send us a message for fast fix support.',
              btnLabel: "Let's Fix It",
            },
            {
              icon: <MdOutlineAutoFixHigh className='w-9 h-9 text-teal-700 dark:text-teal-500 mb-4' />,
              title: 'Request a Feature',
              desc: "Have an idea for a new feature? We'd love to hear it.",
              btnLabel: 'Request',
            },
            {
              icon: <MdSupportAgent className='w-9 h-9 text-teal-700 dark:text-teal-500 mb-4' />,
              title: 'Live Chat',
              desc: (
                <>Need urgent help? Chat with our support team{' '}<b className='animate-pulse text-green-500'>live.</b></>
              ),
              btnLabel: 'Go Live',
            },
          ].map(({ icon, title, desc, btnLabel }) => (
            <div key={title} className='border border-gray-200 dark:border-gray-700 rounded-2xl p-6 flex flex-col bg-gray-50 dark:bg-white/5 hover:-translate-y-1 transition-transform duration-300'>
              {icon}
              <h3 className='font-bold text-lg text-gray-900 dark:text-white mb-2'>{title}</h3>
              <p className='text-sm text-gray-600 dark:text-gray-400 flex-grow'>{desc}</p>
              <button
                onClick={() => toast('Feature coming soon!', { icon: '🚀' })}
                className='mt-5 text-sm bg-white/10 hover:bg-teal-600 px-4 py-2 self-start rounded-lg text-white font-semibold transition-colors'
              >
                {btnLabel}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ + Contact form */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-10'>
          <div className="lg:col-span-2">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
              Frequently Asked Questions
              {search && (
                <span className="ml-3 text-sm font-normal text-gray-500 dark:text-gray-400">
                  {filteredFaqs.length} result{filteredFaqs.length !== 1 ? 's' : ''} for "{search}"
                </span>
              )}
            </h3>
            <div>
              {filteredFaqs.length > 0 ? (
                filteredFaqs.map((faq, i) => (
                  <FAQItem key={i} question={faq.question} answer={faq.answer} />
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 py-8 text-center">No FAQs match your search.</p>
              )}
            </div>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 p-6 sm:p-8 rounded-2xl shadow-xl bg-gray-50 dark:bg-white/5">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Send us a Message</h3>
            <form className="space-y-5" onSubmit={handleFormSubmit}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                <input type="text" id="name" name="name" value={formData.name} onChange={handleFormChange} className={inputClass} placeholder="Your name" />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                <input type="email" id="email" name="email" value={formData.email} onChange={handleFormChange} className={inputClass} placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
                <textarea id="message" name="message" rows={4} value={formData.message} onChange={handleFormChange} className={inputClass + ' resize-none'} placeholder="How can we help?" />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-semibold text-white bg-white/10 hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ContactPage;
