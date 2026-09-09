'use client';

import StoreVisitFormSimple from '@/components/store-visit/form/index';
import { ToastProvider } from './toast';

export default function StoreVisitWrapper() {
  return (
    <ToastProvider>
      <StoreVisitFormSimple />
    </ToastProvider>
  );
}
