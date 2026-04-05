'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email, password) => {
    const result = await cognitoSignIn(email, password);
    if (result.newPasswordRequired) {
      return result; // caller handles new password flow
    }
    const u = await getCurrentUser();
    setUser(u);
    return u;
  }, []);

  const signUp = useCallback(async (email, password) => {
    return cognitoSignUp(email, password);
  }, []);

  const confirmSignUp = useCallback(async (email, code) => {
    return cognitoConfirmSignUp(email, code);
  }, []);

  const completeNewPassword = useCallback(async (cognitoUser, newPassword) => {
    await cognitoCompleteNewPassword(cognitoUser, newPassword);
    const u = await getCurrentUser();
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(() => {
    cognitoSignOut();
    setUser(null);
  }, []);

  const forgotPassword = useCallback(async (email) => {
    return cognitoForgotPassword(email);
  }, []);

  const confirmPassword = useCallback(async (email, code, newPassword) => {
    return cognitoConfirmPassword(email, code, newPassword);
  }, []);

  const getAuthHeaders = useCallback(async () => {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

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
