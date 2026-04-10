'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useMusicHref } from '@/lib/musicLinks';

export default function MagicLoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('Signing you in...');
  const [error, setError] = useState(null);
  const musicHref = useMusicHref();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No login token found in link.');
      return;
    }

    fetch(`/api/music/auth/magic?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        // Store token same way as normal sign-in
        localStorage.setItem('music_auth_token', data.idToken);
        setStatus('Success! Redirecting...');
        router.push(musicHref('/'));
      })
      .catch((err) => {
        setError(err.message);
      });
  }, [searchParams, router]);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        {error ? (
          <>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Link Invalid</h1>
            <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>{error}</p>
            <a href={musicHref('/login')} style={{ color: 'var(--accent-1, #0a8)', textDecoration: 'underline' }}>
              Sign in with email instead
            </a>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>
              <i className="fa-solid fa-spinner fa-spin" />
            </div>
            <p>{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
