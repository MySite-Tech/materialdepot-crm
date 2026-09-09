'use client';

export type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  contact: string | null;
  installer_type: string | null;
  city: string | null;
  passcode: string | null;
  pay_rates: Record<string, number | null> | null;
  created_at?: string;

  deleted_at?: string | null;
  deleted_by?: string | null;
  exit_reason?: string | null;
};
