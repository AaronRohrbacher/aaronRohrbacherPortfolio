'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Style from './AuthForm.module.scss';

export default function ForgotPasswordForm() {
  const { forgotPassword, confirmPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState('request'); // 'request' | 'confirm'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep('confirm');
    } catch (err) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmPassword(email, code, newPassword);
      router.push('/music/login');
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'confirm') {
    return (
      <div className={Style.wrap}>
        <form className={Style.card} onSubmit={handleConfirm}>
          <h1>Reset Password</h1>
          <p>Enter the code sent to {email}</p>
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
          <input
            className={Style.input}
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button className={Style.btn} type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={Style.wrap}>
      <form className={Style.card} onSubmit={handleRequest}>
        <h1>Forgot Password</h1>
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
        <button className={Style.btn} type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send Reset Code'}
        </button>
        <div className={Style.link}>
          <Link href="/music/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
