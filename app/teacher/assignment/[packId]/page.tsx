import { redirect } from 'next/navigation';

export default function LegacyTeacherAssignmentRedirect({ params }: { params: { packId: string } }) {
  redirect(`/practice/assignment/${params.packId}`);
}

