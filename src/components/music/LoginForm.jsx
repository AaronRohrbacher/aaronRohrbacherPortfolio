'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Style from './AuthForm.module.scss';
import { useMusicHref } from '@/lib/musicLinks';

export default function LoginForm() {
  const { signIn, completeNewPassword } = useAuth();
  const router = useRouter();
  const musicHref = useMusicHref();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsNewPassword, setNeedsNewPassword] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (needsNewPassword) {
        await completeNewPassword(needsNewPassword, newPassword);
        router.push(musicHref('/'));
        return;
      }
      const result = await signIn(email, password);
      if (result?.newPasswordRequired) {
        setNeedsNewPassword(result.cognitoUser);
        setLoading(false);
        return;
      }
      router.push(musicHref('/'));
    } catch (err) {
      setError(err.message || 'Sign in failed');
      setLoading(false);
    }
  }

  return (
    <div className={Style.wrap}>
      <form className={Style.card} onSubmit={handleSubmit}>
        <h1>{needsNewPassword ? 'Set New Password' : 'Sign In'}</h1>
        {needsNewPassword ? (
          <p>Your account requires a new password.</p>
        ) : null}

        {error && <p className={Style.error}>{error}</p>}

        {!needsNewPassword && (
          <>
            <input
              className={Style.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className={Style.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </>
        )}

        {needsNewPassword && (
          <input
            className={Style.input}
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        )}

        <button className={Style.btn} type="submit" disabled={loading}>
          {loading ? 'Signing in...' : needsNewPassword ? 'Set Password' : 'Sign In'}
        </button>

        {!needsNewPassword && (
          <>
            <div className={Style.link}>
              <Link href={musicHref('/forgot-password')}>Forgot password?</Link>
            </div>
            <div className={Style.link}>
              Don&apos;t have an account? <Link href={musicHref('/signup')}>Sign up</Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
