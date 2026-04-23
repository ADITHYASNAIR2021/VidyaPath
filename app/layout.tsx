import type { Metadata, Viewport } from 'next';
import { Fraunces, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import MobileBottomNav from '@/components/MobileBottomNav';
import FloatingAIButton from '@/components/FloatingAIButton';
import FloatingPomodoro from '@/components/FloatingPomodoro';
import PrivacyAnalytics from '@/components/PrivacyAnalytics';
import SiteFooter from '@/components/SiteFooter';
import AppMainShell from '@/components/AppMainShell';
import { ThemeProvider } from '@/components/ThemeProvider';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const BASE_URL = 'https://sreyas-vidyapath.vercel.com';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FDFAF6' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1220' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'VidyaPath - Free CBSE Study Platform',
    template: '%s | VidyaPath',
  },
  description:
    'Free CBSE study platform for Class 10 and 12 with chapter intelligence, AI tutor, previous year papers, and board-focused practice for Science, Math, and English Core.',
  keywords: [
    'CBSE', 'Class 10', 'Class 12', 'NCERT', 'Science', 'Math', 'Physics',
    'Chemistry', 'Biology', 'JEE', 'NEET', 'Free study material', 'AI tutor',
    'Previous year papers', 'Board exam', 'India', 'VidyaPath',
  ],
  authors: [{ name: 'VidyaPath' }],
  creator: 'VidyaPath',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: BASE_URL,
    siteName: 'VidyaPath',
    title: 'VidyaPath - Free CBSE Study Platform',
    description: 'Chapter intelligence + AI tutor + previous year papers for Class 10 and 12 board prep.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'VidyaPath - Free CBSE Study Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VidyaPath - Free CBSE Study Platform',
    description: 'Chapter intelligence + AI tutor + previous year papers. 100% free.',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icon.png',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'VidyaPath',
    description: 'Free CBSE study platform for Class 10 and 12 students in India across Science, Math, and English Core.',
    url: BASE_URL,
    inLanguage: 'en-IN',
    educationalCredentialAwarded: 'CBSE Board Preparation',
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
    },
  };

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var saved=localStorage.getItem('vp-theme');var dark=saved?saved==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){}})();",
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <meta name="color-scheme" content="light dark" />
        {/* iOS PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VidyaPath" />
        {/* Android Chrome PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-[#FDFAF6] dark:bg-gray-900 pb-16 md:pb-0 transition-colors duration-200">
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy-700 focus:shadow-lg focus:outline-none"
          >
            Skip to main content
          </a>
          <PrivacyAnalytics />
          <Navbar />
          <AppMainShell>{children}</AppMainShell>
          <SiteFooter />
          <MobileBottomNav />
          <PwaInstallPrompt />
          <FloatingPomodoro />
          <FloatingAIButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
