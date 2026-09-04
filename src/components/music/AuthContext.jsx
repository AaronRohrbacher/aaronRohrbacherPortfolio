'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  signIn as cognitoSignIn,
  signUp as cognitoSignUp,
  confirmSignUp as cognitoConfirmSignUp,
  signOut as cognitoSignOut,
  getCurrentUser,
  getIdToken,
  forgotPassword as cognitoForgotPassword,
  confirmPassword as cognitoConfirmPassword,
  completeNewPassword as cognitoCompleteNewPassword,
} from '@/lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [idToken, setIdToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authVersion, setAuthVersion] = useState(0);

  const notifySignup = useCallback(async (stage, email) => {
    try {
      await fetch('/api/auth/signup-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, email }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const u = await getCurrentUser();
        if (u) {
          const t = await getIdToken();
          setUser(u);
          setIdToken(t);
        }
      } catch {
        setUser(null);
        setIdToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const result = await cognitoSignIn(email, password);
    if (result.newPasswordRequired) {
      return result; // caller handles new password flow
    }
    setUser(result.user);
    setIdToken(result.idToken);
    setAuthVersion((version) => version + 1);
    return result.user;
  }, []);

  const signUp = useCallback(async (email, password) => {
    const result = await cognitoSignUp(email, password);
    await notifySignup('submitted', email);
    return result;
  }, [notifySignup]);

  const confirmSignUp = useCallback(async (email, code) => {
    const result = await cognitoConfirmSignUp(email, code);
    await notifySignup('confirmed', email);
    return result;
  }, [notifySignup]);

  const completeNewPassword = useCallback(async (cognitoUser, newPassword) => {
    await cognitoCompleteNewPassword(cognitoUser, newPassword);
    const u = await getCurrentUser();
    const t = await getIdToken();
    setUser(u);
    setIdToken(t);
    setAuthVersion((version) => version + 1);
    return u;
  }, []);

  const signOut = useCallback(() => {
    cognitoSignOut();
    setUser(null);
    setIdToken(null);
    setAuthVersion((version) => version + 1);
    router.refresh();
  }, [router]);

  const forgotPassword = useCallback(async (email) => {
    return cognitoForgotPassword(email);
  }, []);

  const confirmPassword = useCallback(async (email, code, newPassword) => {
    return cognitoConfirmPassword(email, code, newPassword);
  }, []);

  const getAuthHeaders = useCallback(async () => {
    if (idToken) return { Authorization: `Bearer ${idToken}` };
    const token = await getIdToken();
    if (token) setIdToken(token);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [idToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        confirmSignUp,
        completeNewPassword,
        signOut,
        forgotPassword,
        confirmPassword,
        getAuthHeaders,
        authVersion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
