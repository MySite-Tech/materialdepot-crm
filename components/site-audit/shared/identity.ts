/* Role Viewer preview links carry whose dashboard to open. The raw email put a
   staff address in the address bar and in history, so it travels base64url as
   `?p=`. Tidiness, not access control — the route still needs a CRM session.
   `?person=` is still read, for older bookmarks. */
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

/* Digits-only last 10. The CRM logs users in by phone; `profiles.contact`
   stores the same numbers with inconsistent +91/spacing. Compare through this
   on both sides. */
export function phoneKey(p?: string | null): string {
  const d = String(p || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
}
