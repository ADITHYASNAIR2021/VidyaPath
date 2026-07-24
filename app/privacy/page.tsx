import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — VidyaPath',
  description: 'How VidyaPath collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FDFAF6] px-4 py-16">
      <article className="mx-auto max-w-3xl space-y-5 text-sm leading-7 text-gray-700 [&_a]:font-medium [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-navy-700 [&_li]:pl-1 [&_strong]:text-navy-700 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <h1 className="font-fraunces text-3xl font-bold text-navy-700">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: July 24, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>
          VidyaPath collects only the information necessary to provide educational services:
        </p>
        <ul>
          <li><strong>Account information:</strong> School-provided names, login IDs, roll codes, class, section, role, and contact details used to provide an account.</li>
          <li><strong>Learning records:</strong> Assignments, answers, grades, attendance, notes, questions, and study progress.</li>
          <li><strong>User content:</strong> Prompts, questions, uploads, and other material you choose to submit.</li>
          <li><strong>Technical and security data:</strong> Browser information, IP address, request identifiers, audit events, and service diagnostics.</li>
        </ul>
        <p>VidyaPath does not use student information for targeted advertising or sell personal data.</p>

        <h2>2. How We Use Your Data</h2>
        <ul>
          <li>To authenticate you and provide role-appropriate access (student, teacher, admin).</li>
          <li>To personalize learning: recommend chapters, generate flashcards, and adapt practice difficulty.</li>
          <li>To improve the platform: aggregate usage patterns help us identify which features need work.</li>
          <li>To communicate: service announcements, password reset links, and optional notifications.</li>
        </ul>
        <p>We never sell, rent, or share personal data with third parties for advertising.</p>

        <h2>3. Data Storage & Security</h2>
        <ul>
          <li>Platform data is stored with configured cloud and database providers and protected in transit.</li>
          <li>Session cookies are HMAC-signed with HttpOnly and SameSite flags.</li>
          <li>API mutations are protected by origin checks, role authorization, rate limiting, and audit logging.</li>
          <li>Access is limited by school and role. No security control can eliminate every risk.</li>
        </ul>

        <h2>4. AI & Third-Party Services</h2>
        <p>
          VidyaPath uses AI models from Groq, Google Gemini, and NVIDIA to generate study content.
          AI requests include the prompt and relevant learning context needed to answer it. VidyaPath
          does not intentionally add account identity to those prompts. Do not include unnecessary
          personal or sensitive information in AI questions. Provider handling is governed by the
          applicable provider terms and the platform&apos;s configured account settings.
        </p>

        <h2>5. Cookies</h2>
        <p>
          We use essential cookies for authentication (session tokens) and preferences (theme).
          No advertising or tracking cookies are used. You can disable cookies in your browser,
          but the platform will not function without authentication cookies.
        </p>

        <h2>6. Your Rights</h2>
        <ul>
          <li><strong>Access:</strong> Request a copy of your data by contacting your school administrator.</li>
          <li><strong>Correction:</strong> Update your information through your school or the platform settings.</li>
          <li><strong>Deletion:</strong> Request account deletion through your school administrator.</li>
          <li><strong>Portability:</strong> Ask your school for an available export of your learning records.</li>
        </ul>

        <h2>7. Retention</h2>
        <p>
          Records are retained while needed to provide the service, meet school requirements, protect
          platform security, or satisfy applicable obligations. Deletion requests may take time to
          propagate through backups and legally required records.
        </p>

        <h2>8. Children&apos;s Privacy</h2>
        <p>
          VidyaPath is designed for CBSE students (typically ages 14-18). Accounts are created and
          managed by schools. Schools and guardians are responsible for providing the notices,
          permissions, and supervision required for their students. A guardian with a privacy concern
          should contact the school administrator.
        </p>

        <h2>9. Contact</h2>
        <p>
          For privacy concerns, contact your school administrator or email us at{' '}
          <a href="mailto:privacy@vidyapath.in" className="text-saffron-600 underline">
            privacy@vidyapath.in
          </a>.
        </p>
      </article>
    </main>
  );
}
