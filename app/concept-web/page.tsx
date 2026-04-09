'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { GitBranch, Network } from 'lucide-react';
import MermaidRenderer from '@/components/MermaidRenderer';
import { buildConceptWebMermaid } from '@/lib/concept-web';

const SUBJECT_OPTIONS = [
  'All',
  'Physics',
  'Chemistry',
  'Biology',
  'Math',
  'Accountancy',
  'Business Studies',
  'Economics',
  'English Core',
] as const;
const CLASS_OPTIONS = ['All', '10', '12'] as const;

export default function ConceptWebPage() {
  const [selectedSubject, setSelectedSubject] = useState<(typeof SUBJECT_OPTIONS)[number]>('All');
  const [selectedClass, setSelectedClass] = useState<(typeof CLASS_OPTIONS)[number]>('All');

  const chart = useMemo(() => {
    return buildConceptWebMermaid({
      subject: selectedSubject === 'All' ? undefined : selectedSubject,
      classLevel: selectedClass === 'All' ? undefined : Number(selectedClass) as 10 | 12,
    });
  }, [selectedClass, selectedSubject]);

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="bg-gradient-to-br from-emerald-700 to-teal-700 text-white px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-fraunces text-3xl sm:text-4xl font-bold">Concept Web</h1>
          <p className="text-emerald-100 mt-2 text-sm sm:text-base max-w-3xl">
            Visualize how topics connect across chapters and subjects. Learn as a network, not isolated units.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-white/15 border border-white/20 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Network className="w-3.5 h-3.5" />
            Cross-topic dependency map
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="bg-white border border-[#E8E4DC] rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-[#6A6A84]">Class Filter</span>
            {CLASS_OPTIONS.map((value) => (
              <button
                key={value}
                onClick={() => setSelectedClass(value)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  selectedClass === value
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-700 border-emerald-200'
                }`}
              >
                {value === 'All' ? 'All Classes' : `Class ${value}`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center mt-3">
            <span className="text-xs font-semibold text-[#6A6A84]">Subject Filter</span>
            {SUBJECT_OPTIONS.map((value) => (
              <button
                key={value}
                onClick={() => setSelectedSubject(value)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  selectedSubject === value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-700 border-indigo-200'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <MermaidRenderer chart={chart} title="Topic Dependency Graph" />

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-[#E8E4DC] rounded-2xl p-4 shadow-sm">
            <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-saffron-500" />
              How To Use This Map
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-[#3B3852] list-decimal pl-5">
              <li>Pick your class + subject filters and open the graph.</li>
              <li>Follow arrows from core definitions to application chapters.</li>
              <li>Use the linked chapters for focused revision loops.</li>
            </ol>
          </div>

          <div className="bg-white border border-[#E8E4DC] rounded-2xl p-4 shadow-sm">
            <h2 className="font-fraunces text-lg font-bold text-navy-700">Suggested Study Flow</h2>
            <ul className="mt-3 space-y-2 text-sm text-[#3B3852] list-disc pl-5">
              <li>Revise prerequisite nodes first (definitions, laws, units).</li>
              <li>Then solve chapter drills from dependent nodes.</li>
              <li>Close with a mixed adaptive test across connected chapters.</li>
            </ul>
            <Link href="/dashboard" className="mt-3 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800">
              Open Dashboard Coach
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}


