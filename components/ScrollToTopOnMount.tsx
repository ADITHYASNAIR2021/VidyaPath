'use client';

import { useEffect } from 'react';

export default function ScrollToTopOnMount() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  return null;
}
