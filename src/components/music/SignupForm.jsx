'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Style from './AuthForm.module.scss';
import { useMusicHref } from '@/lib/musicLinks';

export default function SignupForm() {
  const { signUp, confirmSignUp } = useAuth();
  const router = useRouter();
  const musicHref = useMusicHref();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('signup'); // 'signup' | 'confirm'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signUp(email, password);
      setStep('confirm');
    } catch (err) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      router.push(musicHref('/login'));
    } catch (err) {
      setError(err.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'confirm') {
    return (
      <div className={Style.wrap}>
        <form className={Style.card} onSubmit={handleConfirm}>
          <h1>Check Your Email</h1>
          <p>We sent a verification code to {email}</p>
          {error && <p className={Style.error}>{error}</p>}
          <input
            className={Style.input}
            type="text"
            placeholder="Verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="one-time-code"
          />
          <button className={Style.btn} type="submit" disabled={loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={Style.wrap}>
      <form className={Style.card} onSubmit={handleSignup}>
        <h1>Create Account</h1>
        {error && <p className={Style.error}>{error}</p>}
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
          minLength={8}
          autoComplete="new-password"
        />
        <button className={Style.btn} type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Sign Up'}
        </button>
        <div className={Style.link}>
          Already have an account? <Link href={musicHref('/login')}>Sign in</Link>
        </div>
      </form>
    </div>
  );
}
