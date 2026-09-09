import { EXCLUDED_ROLES } from '../crm/roles';
import { API_BASE_URL, mdFetch, saveToken, saveRefreshToken } from './client';

export async function sendOtp(phone: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/login-otp/?contact=${phone}&country_code=91`);
  if (!res.ok) throw new Error(`Failed to send OTP: ${res.status}`);
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/verify-otp/?contact=${phone}&otp=${otp}`);
  if (!res.ok) return false;
  try {
    const data = await res.json();
    if (data?.token) saveToken(data.token);
    if (data?.refresh) saveRefreshToken(data.refresh);
  } catch {}
  return true;
}

export async function loginWithPhone(phone: string): Promise<import('../../../types/crm').AppUser | null> {
  try {
    const data = await mdFetch(`/crm/user-profile/?phone=${phone}`);
    if (!data) return null;
    if (EXCLUDED_ROLES.has(data.role)) return null;
    return {
      id: data.id,
      name: data.name,
      phone: data.phone,
      role: data.role,
      allowedBranches: data.allowedBranches || [],
      individualPermissions: data.individualPermissions || [],
    };
  } catch {
    return null;
  }
}

