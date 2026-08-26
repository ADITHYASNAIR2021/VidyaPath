import FirstLoginPasswordPage from '@/components/auth/FirstLoginPasswordPage';

export default function AdminFirstLoginPage() {
  return (
    <FirstLoginPasswordPage
      role="admin"
      sessionEndpoint="/api/admin/session/me"
      loginHref="/admin/login"
      workspaceHref="/admin"
    />
  );
}
