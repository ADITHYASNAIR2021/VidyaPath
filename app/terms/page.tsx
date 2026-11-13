import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — VidyaPath',
  description: 'Terms and conditions for using the VidyaPath learning platform.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#FDFAF6] px-4 py-16">
      <article className="mx-auto max-w-3xl space-y-5 text-sm leading-7 text-gray-700 [&_a]:font-medium [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-navy-700 [&_li]:pl-1 [&_strong]:text-navy-700 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <h1 className="font-fraunces text-3xl font-bold text-navy-700">Terms of Service</h1>
        <p className="text-sm text-gray-500">Last updated: November 13, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By using VidyaPath, you agree to these terms. If you are under 18, please read them with a
          parent or guardian.
        </p>

        <h2>2. Service Description</h2>
        <p>
          VidyaPath provides free CBSE study resources including chapter notes, previous year
          question papers, AI-powered tutoring, flashcards, and practice tests for Class 10 and 12.
          The platform is provided &quot;as is&quot; for educational purposes.
        </p>

        <h2>3. No Accounts</h2>
        <ul>
          <li>VidyaPath does not require an account or login.</li>
          <li>Your progress, notes and flashcards are stored only in your browser; you are responsible for keeping a copy if you need one.</li>
          <li>AI features have fair-use limits (per minute and per day) so the service stays free for everyone.</li>
        </ul>

        <h2>4. Acceptable Use</h2>
        <p>You agree NOT to:</p>
        <ul>
          <li>Use automated scripts, bots, or scraping tools on the platform.</li>
          <li>Attempt to bypass rate limits, usage limits, or security controls.</li>
          <li>Upload malicious content or abuse the AI tutoring system.</li>
          <li>Use the platform for commercial purposes without authorization.</li>
          <li>Share copyrighted NCERT/CBSE content outside the platform in violation of fair use.</li>
        </ul>

        <h2>5. AI-Generated Content</h2>
        <p>
          Our AI tutor generates study explanations, flashcards, and practice questions. While we
          strive for accuracy, AI-generated content may contain errors. Always verify with your
          NCERT textbooks and teachers. VidyaPath is not responsible for academic decisions made
          based on AI-generated content.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          Rights in CBSE, NCERT, and third-party material remain with their respective owners and the
          material may be used only as permitted by applicable terms and law. The VidyaPath platform,
          its design, and original software are owned by their respective contributors or licensors.
          Notes you write remain yours and stay on your device.
        </p>

        <h2>7. Limitation of Liability</h2>
        <p>
          VidyaPath is provided free of charge. We are not liable for:
        </p>
        <ul>
          <li>Service interruptions or downtime.</li>
          <li>Accuracy of AI-generated study content.</li>
          <li>Loss caused by events outside reasonable platform control.</li>
          <li>Third-party links or resources referenced in study materials.</li>
        </ul>

        <h2>8. Termination</h2>
        <p>
          We may block access from networks or clients that abuse the service or violate these terms,
          for example by automated scraping or by deliberately exhausting AI usage limits.
        </p>

        <h2>9. Changes to Terms</h2>
        <p>
          Continued use after changes constitutes acceptance. The current version and date are
          always available on this page.
        </p>

        <h2>10. Governing Law</h2>
        <p>
          These terms are governed by the laws of India. Disputes shall be subject to the
          jurisdiction of courts in Kerala, India.
        </p>

        <h2>11. Contact</h2>
        <p>
          For legal inquiries:{' '}
          <a href="mailto:legal@vidyapath.in" className="text-saffron-600 underline">
            legal@vidyapath.in
          </a>
        </p>
      </article>
    </main>
  );
}
