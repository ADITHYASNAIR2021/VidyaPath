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
        <p className="text-sm text-gray-500">Last updated: July 24, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing VidyaPath, you agree to these terms. If you are a student, your school
          has accepted these terms on your behalf as part of their educational services.
        </p>

        <h2>2. Service Description</h2>
        <p>
          VidyaPath provides free CBSE study resources including chapter notes, previous year
          question papers, AI-powered tutoring, flashcards, and practice tests for Class 10 and 12.
          The platform is provided &quot;as is&quot; for educational purposes.
        </p>

        <h2>3. User Accounts</h2>
        <ul>
          <li>Student accounts are provisioned by your school with unique roll codes.</li>
          <li>You are responsible for maintaining the confidentiality of your password.</li>
          <li>Sharing accounts or accessing another user&apos;s data is prohibited.</li>
          <li>Schools may deactivate accounts at their discretion.</li>
        </ul>

        <h2>4. Acceptable Use</h2>
        <p>You agree NOT to:</p>
        <ul>
          <li>Use automated scripts, bots, or scraping tools on the platform.</li>
          <li>Attempt to bypass authentication, rate limits, or security controls.</li>
          <li>Upload malicious content or abuse the AI tutoring system.</li>
          <li>Use the platform for commercial purposes without authorization.</li>
          <li>Share copyrighted NCERT/CBSE content outside the platform in violation of fair use.</li>
        </ul>

        <h2>5. AI-Generated Content</h2>
        <p>
          Our AI tutor generates study explanations, flashcards, and practice questions. While we
          strive for accuracy, AI-generated content may contain errors. Always verify with your
          textbooks and teachers. VidyaPath is not responsible for academic decisions made
          based on AI-generated content.
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          Rights in CBSE, NCERT, and third-party material remain with their respective owners and the
          material may be used only as permitted by applicable terms and law. The VidyaPath platform,
          its design, and original software are owned by their respective contributors or licensors.
          User-generated content (teacher notes, quiz questions) remains the property of the creator.
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
          We reserve the right to suspend accounts that violate these terms. Schools may request
          bulk account termination. Related records are handled under the current privacy policy,
          school requirements, backup cycles, and applicable obligations.
        </p>

        <h2>9. Changes to Terms</h2>
        <p>
          We will notify active users of material changes via the platform. Continued use after
          changes constitutes acceptance. The current version is always available at this page.
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
