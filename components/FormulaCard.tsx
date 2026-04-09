'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

export default function FormulaCard({ formulas }: { formulas: { name: string; latex: string }[] }) {
  const [open, setOpen] = useState(false);

  if (!formulas || formulas.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm overflow-hidden mb-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
      >
        <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calculator className="w-4 h-4 text-purple-600" />
          </div>
          Key Formulas Cheat Sheet
        </h2>
        {open ? <ChevronUp className="w-5 h-5 text-[#8A8AAA]" /> : <ChevronDown className="w-5 h-5 text-[#8A8AAA]" />}
      </button>
      <div className="px-5 pb-3 -mt-2">
        <Link href="/equations" className="text-xs font-semibold text-indigo-700 hover:text-indigo-800">
          Open full equations library
        </Link>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E8E4DC] overflow-hidden"
          >
            <div className="p-5 space-y-4">
              {formulas.map((formula, idx) => (
                <div key={idx} className="bg-[#FDFAF6] rounded-xl p-4 border border-[#E8E4DC]/60">
                  <div className="text-sm font-semibold text-navy-700 mb-2">{formula.name}</div>
                  <div className="overflow-x-auto pb-1 text-lg">
                    <BlockMath math={formula.latex} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
