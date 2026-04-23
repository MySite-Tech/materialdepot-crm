'use client';

import React, { useState, createContext, useContext } from 'react';
import StoreVisitFormSimple from './StoreVisitFormSimple';

// Create toast context
const ToastContext = createContext();

// Toast provider component
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = ({ title, description, variant = 'default' }) => {
    const id = Date.now();
    const newToast = { id, title, description, variant };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast rendering */}
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
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

// Custom hook to use toast
function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Override the useToast hook in the StoreVisitForm
export default function StoreVisitWrapper() {
  return (
    <ToastProvider>
      <StoreVisitFormWithToast />
    </ToastProvider>
  );
}

// Wrapper component that provides the toast context to StoreVisitForm
function StoreVisitFormWithToast() {
  return <StoreVisitFormSimple />;
}
