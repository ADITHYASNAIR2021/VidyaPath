'use client';

import { usePathname } from 'next/navigation';
import FloatingAIButton from '@/components/FloatingAIButton';
import FloatingPomodoro from '@/components/FloatingPomodoro';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

/** Floating study widgets for students; hidden on the operator-only developer console. */
export default function StudentOverlays() {
  const pathname = usePathname();
  if (pathname.startsWith('/developer')) return null;
  return (
    <>
      <PwaInstallPrompt />
      <FloatingPomodoro />
      <FloatingAIButton />
    </>
  );
}
