import React, { createContext, useContext } from 'react';

export interface CurrentUser {
  id: string;           // UUID
  email: string;
  emailVerified: boolean;
  walletAddress: string | null;
  displayName?: string | null;   // from UserDto.displayName
  loginCount?: number;           // from UserDto.loginCount
  isPremium: boolean;
}

export type AuthState = 'loading' | 'unauthenticated' | 'authenticated';

export interface AuthContextValue {
  authState: AuthState;
  currentUser: CurrentUser | null;
  error: string | null;
  getJwt: () => string | null;
  signup: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * useAuth — access the email-auth context from any component.
 * Must be used inside <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
