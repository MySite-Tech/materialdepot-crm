'use client';

import React, { useState, createContext, useContext } from 'react';
import StoreVisitFormSimple from './StoreVisitFormSimple';

interface Toast {
  id: number;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastContextValue {
  toast: (opts: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = ({ title, description, variant = 'default' }: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, description, variant }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={`fixed top-20 right-4 z-[9999] p-4 rounded-lg shadow-lg max-w-sm ${
            toastItem.variant === 'destructive'
              ? 'bg-red-500 text-white'
              : 'bg-gray-800 text-white'
          }`}
        >
          {toastItem.title && <div className="font-semibold">{toastItem.title}</div>}
          {toastItem.description && <div className="text-sm mt-1">{toastItem.description}</div>}
        </div>
      ))}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default function StoreVisitWrapper() {
  return (
    <ToastProvider>
      <StoreVisitFormSimple />
    </ToastProvider>
  );
}
