import { redirect } from 'next/navigation';

export default function EquationsPage() {
  redirect('/formulas?view=chapters');
}
