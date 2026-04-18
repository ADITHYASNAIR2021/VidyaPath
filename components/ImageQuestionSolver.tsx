'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface ImageQuestionSolverProps {
  chapterTitle: string;
  classLevel: number;
  subject: string;
}

interface SolverResponse {
  solution: string;
  detectedTopic: string;
  confidence: 'high' | 'medium' | 'low';
  followUp: string;
}

function renderMathAwareText(text: string) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.map((line, lineIndex) => {
    const blockMatch = line.match(/^\$\$([\s\S]+)\$\$$/);
    if (blockMatch) {
      return (
        <div key={`block-${lineIndex}`} className="my-2 overflow-x-auto">
          <BlockMath math={blockMatch[1]} />
        </div>
      );
    }

    const tokens = line.split(/(\$[^$]+\$)/g);
    return (
      <p key={`line-${lineIndex}`} className="text-sm text-[#2A2A40] leading-relaxed">
        {tokens.map((token, tokenIndex) => {
          const inline = token.match(/^\$([^$]+)\$$/);
          if (inline) {
            return <InlineMath key={`token-${lineIndex}-${tokenIndex}`} math={inline[1]} />;
          }
          return <span key={`token-${lineIndex}-${tokenIndex}`}>{token}</span>;
        })}
      </p>
    );
  });
}

export default function ImageQuestionSolver({ chapterTitle, classLevel, subject }: ImageQuestionSolverProps) {
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [imageBase64, setImageBase64] = useState('');
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [previewUrl, setPreviewUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SolverResponse | null>(null);

  const confidenceStyle = useMemo(() => {
    const confidence = result?.confidence ?? 'medium';
    if (confidence === 'high') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (confidence === 'low') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }, [result?.confidence]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
          ? payload.data as Record<string, unknown>
          : payload as Record<string, unknown> | null;
        const role = typeof data?.role === 'string' ? data.role : '';
        if (active) setAiEnabled(['student', 'teacher', 'admin', 'developer'].includes(role));
      })
      .catch(() => {
        if (active) setAiEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (aiEnabled === false) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
        <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
          <Camera className="w-5 h-5 text-saffron-500" />
          Image Question Solver
        </h2>
        <p className="mt-2 text-sm text-[#4A4A6A]">
          Login with any account to unlock image question solving.
        </p>
        <div className="mt-3">
          <Link
            href="/login?next=/chapters"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Login
          </Link>
        </div>
      </div>
    );
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) {
      setError('Please upload an image below 1.8 MB for fast solving.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const base64 = dataUrl.split(',')[1] ?? '';
      setImageBase64(base64);
      setMimeType(file.type || 'image/jpeg');
      setPreviewUrl(dataUrl);
      setResult(null);
      setError('');
    };
    reader.readAsDataURL(file);
  }

  async function solveImage() {
    if (!imageBase64 || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/image-solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          prompt,
          classLevel,
          subject,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        setError(data?.message || data?.error || 'Could not solve the image right now.');
        return;
      }
      const payload = (data && typeof data === 'object' && data.data && typeof data.data === 'object')
        ? data.data
        : data;
      setResult(payload as SolverResponse);
    } catch {
      setError('Network issue while solving image.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
      <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
        <Camera className="w-5 h-5 text-saffron-500" />
        Image Question Solver
      </h2>
      <p className="text-xs text-[#6A6A84] mt-1">
        Upload an NCERT/board question photo for {subject} Class {classLevel} - {chapterTitle}.
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex items-center justify-center gap-2 border border-dashed border-[#D9D3C7] bg-[#FDFAF6] rounded-xl px-4 py-4 text-sm text-[#5A5570] cursor-pointer hover:border-saffron-300 transition-colors">
          <UploadCloud className="w-4 h-4 text-saffron-500" />
          Upload question image
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} aria-label="Upload question image" />
        </label>

        {previewUrl && (
          <Image
            src={previewUrl}
            alt="Question preview"
            width={1024}
            height={576}
            className="w-full rounded-xl border border-[#E8E4DC] max-h-72 object-contain bg-white"
            unoptimized
          />
        )}

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          placeholder="Optional: e.g., solve for boards with full steps and final answer format."
          className="w-full text-sm border border-[#E8E4DC] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-saffron-400"
        />

        <button
          onClick={solveImage}
          type="button"
          disabled={!imageBase64 || loading}
          className="inline-flex items-center gap-2 bg-saffron-500 hover:bg-saffron-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Solve from Image
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl border border-[#E8E4DC] bg-[#FCFBF8] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-navy-700">Detected topic: {result.detectedTopic}</p>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${confidenceStyle}`}>
              Confidence: {result.confidence}
            </span>
          </div>
          <div className="space-y-2">{renderMathAwareText(result.solution)}</div>
          <p className="text-xs text-[#6A6A84] border-t border-[#E8E4DC] pt-2">
            Next step: {result.followUp}
          </p>
        </div>
      )}
    </div>
  );
}
