'use client';

import { useEffect, useState } from 'react';
import { screenshotUrl } from '@/lib/api';

interface Props {
  documentId: string;
  page: number;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: 'eager' | 'lazy';
  draggable?: boolean;
}

// screenshotUrl resolves the auth token async (query param, no header possible on <img>),
// so the src can't be computed synchronously in render.
export default function AuthedImg({ documentId, page, ...imgProps }: Props) {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    screenshotUrl(documentId, page).then((url) => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [documentId, page]);

  if (!src) return null;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} {...imgProps} />;
}
