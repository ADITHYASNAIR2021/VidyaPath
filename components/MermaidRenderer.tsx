'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { GitGraph, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'inherit',
});

export default function MermaidRenderer({ chart, title = 'Process Diagram' }: { chart?: string, title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    if (!chart || !open) return;
    const renderChart = async () => {
      try {
        const id = `mermaid-svg-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
      } catch (err) {
        console.error('Mermaid render error', err);
      }
    };
    renderChart();
  }, [chart, open]);

  if (!chart) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm overflow-hidden mb-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
      >
        <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <GitGraph className="w-4 h-4 text-emerald-600" />
          </div>
          {title}
        </h2>
        {open ? <ChevronUp className="w-5 h-5 text-[#8A8AAA]" /> : <ChevronDown className="w-5 h-5 text-[#8A8AAA]" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E8E4DC] overflow-hidden"
          >
            <div className="p-5 flex justify-center overflow-x-auto">
              {svg ? (
                <div dangerouslySetInnerHTML={{ __html: svg }} />
              ) : (
                <div className="text-[#8A8AAA] text-sm animate-pulse flex items-center gap-2">
                  Rendering diagram...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
