import FirstLoginPasswordPage from '@/components/auth/FirstLoginPasswordPage';

export default function TeacherFirstLoginPage() {
  return (
    <FirstLoginPasswordPage
      role="teacher"
      sessionEndpoint="/api/teacher/session/me"
      loginHref="/teacher/login"
      workspaceHref="/teacher"
    />
  );
}
