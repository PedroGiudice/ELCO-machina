import { useState, useCallback, useMemo, useEffect } from 'react';
import { migrateKey, storeSet, storeDelete } from '../services/TauriStore';

// Credenciais (hardcoded para simplicidade)
const AUTH_USERS: Record<string, string> = {
  MCBS: 'Chicago00@',
  PGR: 'Chicago00@',
};

const STORE = 'settings.json' as const;
const KEY = 'auth_user';

export interface UseAuthReturn {
  // State
  isAuthenticated: boolean;
  currentUser: string | null;
  loginUsername: string;
  setLoginUsername: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  loginError: string | null;

  // Actions
  handleLogin: () => void;
  handleLogout: () => void;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Carregar estado de auth no mount
  useEffect(() => {
    migrateKey<string | null>(STORE, KEY, null).then((user) => {
      if (user) {
        setCurrentUser(user);
        setIsAuthenticated(true);
      }
    });
  }, []);

  const handleLogin = useCallback(() => {
    const expectedPassword = AUTH_USERS[loginUsername.toUpperCase()];
    if (expectedPassword && expectedPassword === loginPassword) {
      const user = loginUsername.toUpperCase();
      storeSet(STORE, KEY, user);
      setCurrentUser(user);
      setIsAuthenticated(true);
      setLoginError(null);
    } else {
      setLoginError('Usuario ou senha invalidos');
    }
  }, [loginUsername, loginPassword]);

  const handleLogout = useCallback(() => {
    storeDelete(STORE, KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  return useMemo(() => ({
    isAuthenticated,
    currentUser,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    loginError,
    handleLogin,
    handleLogout,
  }), [isAuthenticated, currentUser, loginUsername, loginPassword, loginError, handleLogin, handleLogout]);
}

export default useAuth;
