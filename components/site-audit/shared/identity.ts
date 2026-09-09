export function encodePerson(email: string): string {
  try {
    return btoa(String(email)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}
export function decodePerson(v: string): string {
  try {
    const b = v.replace(/-/g, '+').replace(/_/g, '/');
    return atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  } catch {
    return '';
  }
}

export function phoneKey(p?: string | null): string {
  const d = String(p || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}
