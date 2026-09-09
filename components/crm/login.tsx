'use client';

import { clearToken, loginWithPhone, sendOtp, verifyOtp } from '../../lib/api';
import { LoginScreenProps } from './types/crm';
import { FormEvent, useState } from 'react';

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!/^\d{10}$/.test(phone.trim())) { setError('Enter a valid 10-digit phone number'); return; }
    setLoading(true);
    setError('');
    try {
      await sendOtp(phone.trim());
      setStep('otp');
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const ok = await verifyOtp(phone.trim(), otp.trim());
      if (!ok) { setError('Invalid OTP. Please try again.'); setLoading(false); return; }
      const user = await loginWithPhone(phone.trim());
      if (!user) { clearToken(); setError('Phone not authorized. Contact your admin.'); setLoading(false); return; }
      onLogin(user);
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const card = (
    <div className="bg-white rounded-lg border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.08)] w-[360px] p-8">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-1 mb-2">
          <span className="text-lg font-bold text-[#1A1A1A]">material</span>
          <span className="text-lg font-bold text-[#EAB308] -ml-1.5">depot</span>
        </div>
        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Sales CRM Login</p>
      </div>

      {step === 'phone' ? (
        <>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Phone Number</label>
          <input
            className="px-2.5 py-2.5 text-[15px] border border-gray-200 rounded-md outline-none font-mono w-full text-center tracking-[0.15em] focus:border-[#EAB308]"
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="9876543210"
            maxLength={10}
            autoFocus
          />
          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
          <button
            type="button"
            disabled={loading || phone.length !== 10}
            onClick={() => handleSendOtp()}
            className={`mt-4 w-full bg-[#EAB308] text-white border-none py-2.5 rounded-md text-[13px] font-semibold cursor-pointer ${loading || phone.length !== 10 ? 'opacity-50' : 'opacity-100'}`}
          >
            {loading ? 'Sending OTP...' : 'Send OTP'}
          </button>
        </>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <p className="text-[12px] text-gray-500 text-center mb-4">OTP sent to <span className="font-semibold text-gray-700">{phone}</span></p>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Enter OTP</label>
          <input
            className="px-2.5 py-2.5 text-[22px] border border-gray-200 rounded-md outline-none font-mono w-full text-center tracking-[0.5em] focus:border-[#EAB308]"
            type="tel"
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="••••"
            maxLength={4}
            autoFocus
          />
          {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || otp.length !== 4}
            className={`mt-4 w-full bg-[#EAB308] text-white border-none py-2.5 rounded-md text-[13px] font-semibold cursor-pointer ${loading || otp.length !== 4 ? 'opacity-50' : 'opacity-100'}`}
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
            className="mt-2 w-full bg-transparent border-none text-gray-400 text-[12px] cursor-pointer py-1"
          >
            ← Change number
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="h-12 bg-[#1A1A1A] flex items-center px-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">material</span>
          <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
          <span className="text-xs text-gray-400 ml-2">Sales CRM</span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">{card}</div>
    </div>
  );
}
