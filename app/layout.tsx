import type { Metadata } from 'next';
import { Fraunces, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import MobileBottomNav from '@/components/MobileBottomNav';
import FloatingAIButton from '@/components/FloatingAIButton';
import PrivacyAnalytics from '@/components/PrivacyAnalytics';
import SiteFooter from '@/components/SiteFooter';

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

const BASE_URL = 'https://vidyapath.vercel.app';

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
    apple: '/apple-touch-icon.png',
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-[#FDFAF6] pb-16 md:pb-0">
        <PrivacyAnalytics />
        <Navbar />
        <main>{children}</main>
        <SiteFooter />
        <MobileBottomNav />
        <FloatingAIButton />
      </body>
    </html>
  );
}


