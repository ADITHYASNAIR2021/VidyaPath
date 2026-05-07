import { redirect } from 'next/navigation';

export default async function LegacyTeacherAssignmentRedirect({ params }: { params: Promise<{ packId: string }> }) {
  const resolvedParams = await params;
  redirect(`/practice/assignment/${resolvedParams.packId}`);
}
