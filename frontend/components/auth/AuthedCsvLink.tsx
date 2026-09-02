'use client';

import { useEffect, useState } from 'react';
import { exportCsvUrl } from '@/lib/api';

interface Props {
  documentId: string;
  className?: string;
  children: React.ReactNode;
}

// exportCsvUrl resolves the auth token async (query param, no header possible on <a>),
// so the href can't be computed synchronously in render.
export default function AuthedCsvLink({ documentId, className, children }: Props) {
  const [href, setHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    exportCsvUrl(documentId).then((url) => { if (!cancelled) setHref(url); });
    return () => { cancelled = true; };
  }, [documentId]);

  return (
    <a href={href} download className={className}>
      {children}
    </a>
  );
}
