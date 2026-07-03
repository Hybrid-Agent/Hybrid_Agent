"use client";
import React from 'react';
import { Toaster } from 'react-hot-toast';

// Most app toasts use the custom card from NotificationProvider; these options
// style the few default toast() / toast.success() calls consistently.
export default function RootToaster() {
  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={10}
      toastOptions={{
        duration: 3000,
        className:
          '!bg-white dark:!bg-[#121212] !text-gray-900 dark:!text-white !border !border-gray-200 dark:!border-gray-700 !rounded-2xl !shadow-xl !text-sm',
        success: { iconTheme: { primary: '#ea580c', secondary: '#fff' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
      }}
    />
  );
}
