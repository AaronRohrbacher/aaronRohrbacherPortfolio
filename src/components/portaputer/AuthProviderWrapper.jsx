'use client';

import { AuthProvider } from '@/components/music/AuthContext';

export default function AuthProviderWrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
