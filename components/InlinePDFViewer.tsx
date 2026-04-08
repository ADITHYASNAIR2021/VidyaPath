'use client';

import { useState } from 'react';
import { BookOpen, Maximize2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function InlinePDFViewer({ pdfUrl }: { pdfUrl: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm overflow-hidden mb-5">
      {/* Trigger Button */}
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between p-4 bg-sky-50 hover:bg-sky-100 border-b border-sky-100 transition-colors group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-sky-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-sm text-navy-700">NCERT Textbook PDF</div>
            <div className="text-xs text-[#4A4A6A]">Read inline without leaving the app</div>
          </div>
        </div>
        <button className="px-4 py-1.5 bg-white text-sky-600 rounded-lg text-sm font-semibold shadow-sm border border-sky-200">
          {open ? 'Close' : 'Read PDF'}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[#E8E4DC] overflow-hidden"
          >
            <div className="relative bg-[#525659]">
              {/* Close button overlay */}
              <button
                onClick={() => setOpen(false)}
                title="Close PDF viewer"
                className="absolute top-3 right-3 z-10 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Full-screen link */}
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open PDF in new tab"
                className="absolute top-3 right-14 z-10 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </a>

              {/* PDF via Google Docs Viewer (bypasses NCERT's X-Frame-Options block) */}
              <iframe
                src={`https://docs.google.com/gview?url=${encodeURIComponent(pdfUrl)}&embedded=true`}
                title="NCERT PDF Viewer"
                className="w-full border-0"
                style={{ height: '75vh', minHeight: '500px' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
