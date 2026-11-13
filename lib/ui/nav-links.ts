import {
  BookOpen,
  Bookmark,
  BrainCircuit,
  Calculator,
  ClipboardCheck,
  Compass,
  FileText,
  GitBranch,
  Home,
  Layers,
  PenSquare,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary navigation — identical for every visitor (no accounts, no roles). */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chapters', label: 'Chapters', icon: BookOpen },
  { href: '/ai-tools', label: 'AI Study Hub', icon: BrainCircuit },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/formulas', label: 'Formulas', icon: Calculator },
  { href: '/dashboard', label: 'My Progress', icon: TrendingUp },
];

/** Secondary study tools — shown in the mobile drawer and command palette. */
export const STUDY_TOOLS_NAV: NavItem[] = [
  { href: '/revision', label: 'Revision Planner', icon: Target },
  { href: '/review', label: 'Flashcard Review', icon: Layers },
  { href: '/mock-exam', label: 'Mock Exam', icon: ClipboardCheck },
  { href: '/notes', label: 'My Notes', icon: PenSquare },
  { href: '/bookmarks', label: 'Saved Chapters', icon: Bookmark },
  { href: '/concept-web', label: 'Concept Web', icon: GitBranch },
  { href: '/career', label: 'Career Paths', icon: Compass },
];

/** Bottom tab bar on phones. */
export const MOBILE_TAB_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/chapters', label: 'Study', icon: BookOpen },
  { href: '/ai-tools', label: 'AI Hub', icon: BrainCircuit },
  { href: '/papers', label: 'Papers', icon: FileText },
  { href: '/dashboard', label: 'Progress', icon: TrendingUp },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  const hrefPath = href.split('?')[0];
  return hrefPath === '/' ? pathname === '/' : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}
