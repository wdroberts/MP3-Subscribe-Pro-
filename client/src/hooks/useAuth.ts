import { useState, useCallback, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  handleCallback: (code: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
}

const TOKEN_KEY = 'mp3_auth_token';
const USER_KEY = 'mp3_auth_user';

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = user !== null && localStorage.getItem(TOKEN_KEY) !== null;

  // Verify token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
      })
      .catch(() => {
        // Keep existing session on network error
      });
  }, []);

  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setIsLoading(false);
    }
  }, []);

  const handleCallback = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/google/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        throw new Error('Authentication failed');
      }

      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const getToken = useCallback(() => {
    return localStorage.getItem(TOKEN_KEY);
  }, []);

  return { user, isAuthenticated, isLoading, login, handleCallback, logout, getToken };
}
