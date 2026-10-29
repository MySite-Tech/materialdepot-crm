import { jsonOf } from './http.mjs';

export const envelope = (data) => ({ success: true, status: 200, data });

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export const jwt = (userId) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
  user_id: userId, exp: Math.floor(Date.now() / 1000) + 30 * 86400,
})}.stub`;

function userIdOf(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).user_id;
  } catch {
    return undefined;
  }
}

export const tenDigits = (v) => String(v ?? '').replace(/\D/g, '').slice(-10);

export const profileOf = (u) => ({
  id: u.userId, name: u.name, phone: u.phone, role: u.role,
  allowedBranches: u.branches ?? [], individualPermissions: u.permissions ?? [],
});

export function rosterRowOf(u) {
  const [first, ...rest] = u.name.split(' ');
  return {
    id: u.userId, status: true,
    user: { id: u.userId, f_name: first, l_name: rest.join(' '), contact: u.phone },
    branch: (u.branches ?? []).map((b) => ({ branch_name: b })),
    user_permission_detail: { id: 0, permission_name: u.role },
    individual_permissions: u.permissions ?? [],
  };
}

export function djangoRouter({ userForPhone, userForId, roster, extra = () => undefined }) {
  return (req) => {
    const { path, query } = req;
    if (path.endsWith('/login-otp/')) {
      userForPhone(query.get('contact'));
      return envelope({ sent: true });
    }
    if (path.endsWith('/verify-otp/')) {
      const u = userForPhone(query.get('contact'));
      return { token: jwt(u.userId), refresh: jwt(u.userId) };
    }
    if (path.endsWith('/token/refresh/')) {
      const u = userForId(userIdOf(jsonOf(req.raw)?.refresh)) ?? userForPhone();
      return { access: jwt(u.userId), refresh: jwt(u.userId) };
    }
    if (path.endsWith('/crm/user-profile/')) return envelope(profileOf(userForPhone(query.get('phone'))));
    if (path.endsWith('/user-organisation/')) return envelope(roster().map(rosterRowOf));
    return extra(req) ?? [];
  };
}

export function localUser(role, permissions) {
  const user = { userId: 900001, name: `Local ${role}`, phone: '9999999999', role, permissions };
  return (phone) => {
    if (phone) user.phone = phone;
    return user;
  };
}
