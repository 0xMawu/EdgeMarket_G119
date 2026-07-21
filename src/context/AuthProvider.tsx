import React, { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext, AuthState, CurrentUser } from './AuthContext';
import { API_PREFIX } from '../config/api';

const JWT_KEY = '@edgemarket/email-jwt';

// decode JWT expiry without verifying the signature
function getJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

// fetch the current user profile from the server
async function fetchCurrentUser(jwt: string): Promise<CurrentUser> {
  const res = await fetch(`${API_PREFIX}/auth/me`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('Unauthorized');
  const data = await res.json();
  return {
    id: data.id,
    email: data.email,
    emailVerified: data.emailVerified,
    walletAddress: data.walletAddress ?? null,
    displayName: data.displayName ?? null,
    loginCount: data.loginCount ?? 0,
    isPremium: data.isPremium ?? false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // keep JWT in a ref so getJwt() always returns the latest value
  const jwtRef = useRef<string | null>(null);
  const [, setJwtTick] = useState(0);

  const setJwt = useCallback((token: string | null) => {
    jwtRef.current = token;
    setJwtTick((n) => n + 1);
  }, []);

  const getJwt = useCallback((): string | null => jwtRef.current, []);

  // check for a saved JWT on startup
  useEffect(() => {
    AsyncStorage.getItem(JWT_KEY)
      .then(async (stored) => {
        if (!stored) { setAuthState('unauthenticated'); return; }
        const exp = getJwtExp(stored);
        if (!exp || exp * 1000 <= Date.now()) {
          await AsyncStorage.removeItem(JWT_KEY);
          setAuthState('unauthenticated');
          return;
        }
        try {
          const user = await fetchCurrentUser(stored);
          setJwt(stored);
          setCurrentUser(user);
          setAuthState('authenticated');
        } catch {
          await AsyncStorage.removeItem(JWT_KEY);
          setAuthState('unauthenticated');
        }
      })
      .catch(() => setAuthState('unauthenticated'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    setError(null);
    const res = await fetch(`${API_PREFIX}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (res.status === 409) throw new Error('An account with this email already exists.');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? 'Signup failed');
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await fetch(`${API_PREFIX}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) throw new Error('Invalid email or password.');
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      const err = new Error((data as { error?: string }).error ?? 'Email not verified.');
      (err as any).status = 403;
      throw err;
    }
    if (!res.ok) throw new Error('Login failed');
    const { token } = await res.json() as { token: string };
    await AsyncStorage.setItem(JWT_KEY, token);
    setJwt(token);
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
    setAuthState('authenticated');
  }, [setJwt]);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    setError(null);
    const res = await fetch(`${API_PREFIX}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    if (!res.ok) throw new Error('Invalid or expired code. Please try again.');
    const { token } = await res.json() as { token: string };
    await AsyncStorage.setItem(JWT_KEY, token);
    setJwt(token);
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
    setAuthState('authenticated');
  }, [setJwt]);

  const resendCode = useCallback(async (email: string) => {
    setError(null);
    const res = await fetch(`${API_PREFIX}/auth/resend-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.status === 429) throw new Error('Too many resend requests. Try again later.');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? 'Resend failed');
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(JWT_KEY);
    setJwt(null);
    setCurrentUser(null);
    setAuthState('unauthenticated');
  }, [setJwt]);

  // re-fetch user profile from server - used after payment to update isPremium
  const refreshUser = useCallback(async () => {
    const jwt = getJwt();
    if (!jwt) return;
    try {
      const user = await fetchCurrentUser(jwt);
      setCurrentUser(user);
    } catch {
      // leave current state as-is if the request fails
    }
  }, [getJwt]);

  return (
    <AuthContext.Provider
      value={{ authState, currentUser, error, getJwt, signup, login, verifyEmail, resendCode, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
