'use client';

import { useMemo } from 'react';
import katex from 'katex';

function readableFormula(value: string): string {
  return value
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1) divided by ($2)')
    .replace(/\\times/g, ' multiplied by ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\Delta/g, 'delta ')
    .replace(/[{}]/g, '')
    .replace(/\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function AccessibleFormula({
  latex,
  label,
  compact = false,
}: {
  latex: string;
  label?: string;
  compact?: boolean;
}) {
  const rendered = useMemo(() => {
    try {
      // MathML-only output avoids the duplicate MathML + positioned HTML layers
      // that can overlap when a browser or service worker serves stale KaTeX CSS.
      return katex.renderToString(latex, {
        displayMode: true,
        output: 'mathml',
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return '';
    }
  }, [latex]);

  const accessibleLabel = label || readableFormula(latex) || 'Mathematical formula';

  if (!rendered) {
    return <span className="block break-words text-center font-mono text-sm">{accessibleLabel}</span>;
  }

  return (
    <div
      className={compact ? 'accessible-formula accessible-formula--compact' : 'accessible-formula'}
      role="math"
      aria-label={accessibleLabel}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
