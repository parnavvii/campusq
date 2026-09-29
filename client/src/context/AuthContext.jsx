import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthAPI, BusinessAPI, tokenStore } from '../lib/api';
import { setDisplayTimeZone } from '../lib/format';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(tokenStore.get());
  const [restoring, setRestoring] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  // Restore the session on page load by asking the server who the token belongs to.
  useEffect(() => {
    if (!token) return setRestoring(false);
    let cancelled = false;
    AuthAPI.me()
      .then((u) => !cancelled && setUser(u))
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('waitwell:unauthorized', onUnauthorized);
    return () => window.removeEventListener('waitwell:unauthorized', onUnauthorized);
  }, [logout]);

  const acceptSession = useCallback(({ token: t, user: u }) => {
    tokenStore.set(t);
    setToken(t);
    setUser(u);
    return u;
  }, []);

  // Staff and admins see times in their own business's timezone.
  useEffect(() => {
    if (user?.business?.timezone) setDisplayTimeZone(user.business.timezone);
  }, [user?.business?.timezone]);

  const value = useMemo(
    () => ({
      user,
      token,
      restoring,
      login: async (email, password) => acceptSession(await AuthAPI.login(email, password)),
      register: async (payload) => acceptSession(await AuthAPI.register(payload)),
      signupBusiness: async (payload) => acceptSession(await BusinessAPI.signup(payload)),
      /** Re-read the signed-in user (e.g. after the admin renames their business). */
      refresh: async () => setUser(await AuthAPI.me()),
      logout,
    }),
    [user, token, restoring, acceptSession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
