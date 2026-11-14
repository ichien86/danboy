'use client';

import { ThemeProvider } from 'next-themes';
import { PenyediaToast } from '@/components/klien';

export function Penyedia({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PenyediaToast>{children}</PenyediaToast>
    </ThemeProvider>
  );
}
