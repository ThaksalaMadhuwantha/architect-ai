/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import api, { getToken, setToken, clearToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  // Token එකක් තියෙනවා නම් විතරයි මුලින් loading පෙන්නන්නේ
  const [loading, setLoading] = useState(() => !!getToken());

  // Page එක load වෙද්දී token එක තියෙනවා නම් user ව නැවත ගන්නවා
  useEffect(() => {
    if (!getToken()) return;

    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password, remember = true) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.data.token, remember);
    setUser(res.data.user);
  };

  const register = async (name, email, password, remember = true) => {
    const res = await api.post('/auth/register', { name, email, password });
    setToken(res.data.token, remember);
    setUser(res.data.user);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);