import { useState, useCallback } from 'react';

// Credenciais (hardcoded para simplicidade)
const AUTH_USERS: Record<string, string> = {
  MCBS: 'Chicago00@',
  PGR: 'Chicago00@',
};

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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('auth_user') !== null;
  });
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('auth_user');
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = useCallback(() => {
    const expectedPassword = AUTH_USERS[loginUsername.toUpperCase()];
    if (expectedPassword && expectedPassword === loginPassword) {
      const user = loginUsername.toUpperCase();
      localStorage.setItem('auth_user', user);
      setCurrentUser(user);
      setIsAuthenticated(true);
      setLoginError(null);
    } else {
      setLoginError('Usuario ou senha invalidos');
    }
  }, [loginUsername, loginPassword]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('auth_user');
    setCurrentUser(null);
    setIsAuthenticated(false);
  }, []);

  return {
    isAuthenticated,
    currentUser,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    loginError,
    handleLogin,
    handleLogout,
  };
}

export default useAuth;
