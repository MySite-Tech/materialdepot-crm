'use client';

import { Suspense } from 'react';
import App from '../components/crm/index';

export default function Page() {
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}
