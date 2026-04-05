'use client';

import dynamic from 'next/dynamic';

const AmazonConnect = dynamic(() => import('./AmazonConnect'), { ssr: false });

export default function AmazonConnectLoader() {
  return <AmazonConnect />;
}
