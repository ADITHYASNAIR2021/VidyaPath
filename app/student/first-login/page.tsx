import FirstLoginPasswordPage from '@/components/auth/FirstLoginPasswordPage';

export default function StudentFirstLoginPage() {
  return (
    <FirstLoginPasswordPage
      role="student"
      sessionEndpoint="/api/student/session/me"
      loginHref="/student/login"
      workspaceHref="/dashboard"
    />
  );
}
