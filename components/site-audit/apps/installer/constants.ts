'use client';

export const INSTALL_STATUS: Record<string, { label: string; badge: string }> = {
  scheduled: { label: 'Scheduled', badge: 'bg-indigo-100 text-indigo-700' },
  callpending: { label: 'Call Pending', badge: 'bg-amber-100 text-amber-700' },
  reschedule: { label: 'To Reschedule', badge: 'bg-red-100 text-red-700' },
  onway: { label: 'On The Way', badge: 'bg-blue-100 text-blue-700' },
  atsite: { label: 'At Site', badge: 'bg-blue-100 text-blue-700' },

  partial: { label: 'Partially Completed', badge: 'bg-teal-100 text-teal-700' },
  completed: { label: 'Completed', badge: 'bg-green-100 text-green-700' },
};

export const INSTALL_STAGES = ['scheduled', 'callpending', 'reschedule', 'onway', 'atsite', 'partial', 'completed'];

export const DEFAULT_LOG_MESSAGES: Record<string, string> = {
  callpending: 'Pre-install call started',
  onway: 'Installer on the way · customer confirmed',
  reschedule: 'Customer declined → sent to office to reschedule',
  atsite: 'Installer arrived at site',
  completed: 'Installation completed',
};
