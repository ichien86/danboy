import type { Metadata, Viewport } from 'next';
import { Penyedia } from './penyedia';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'DANBOY', template: '%s · DANBOY' },
  description: 'Pemantauan sumber dana APBD per tahapan',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Penyedia>{children}</Penyedia>
      </body>
    </html>
  );
}
