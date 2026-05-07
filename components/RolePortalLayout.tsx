import Sidebar from '@/components/Sidebar';

type Role = 'teacher' | 'admin' | 'developer';

interface RolePortalLayoutProps {
  role: Role;
  displayName?: string;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
}

const ROLE_COPY: Record<Role, { title: string; subtitle: string }> = {
  teacher: {
    title: 'Teacher Workspace',
    subtitle: 'Teaching, grading, and class operations',
  },
  admin: {
    title: 'Admin Console',
    subtitle: 'School operations and oversight',
  },
  developer: {
    title: 'Developer Console',
    subtitle: 'Platform operations and diagnostics',
  },
};

export default function RolePortalLayout({
  role,
  displayName,
  children,
  headerContent,
}: RolePortalLayoutProps) {
  const copy = ROLE_COPY[role];

  return (
    <div className="app-shell-bg flex min-h-screen bg-[var(--color-background)]">
      <Sidebar role={role} displayName={displayName} />
      <div className="flex min-h-screen flex-1 flex-col md:ml-60">
        <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 py-2.5 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                {copy.title}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">{copy.subtitle}</p>
            </div>
            {displayName ? (
              <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
                {displayName}
              </div>
            ) : null}
          </div>
          {headerContent ? <div className="mt-2">{headerContent}</div> : null}
        </header>

        <section className="min-h-[calc(100vh-65px)]">
          {children}
        </section>
      </div>
    </div>
  );
}
