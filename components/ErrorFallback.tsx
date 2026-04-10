'use client';

interface ErrorFallbackProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onRetry?: () => void;
}

export default function ErrorFallback(props: ErrorFallbackProps) {
  const title = props.title || 'Something went wrong';
  const message = props.message || 'An unexpected error occurred. Please try again.';
  const actionLabel = props.actionLabel || 'Try again';

  return (
    <div className="min-h-[40vh] w-full bg-[#FDFAF6] px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="font-fraunces text-2xl font-bold text-rose-800">{title}</h2>
        <p className="mt-2 text-sm text-rose-700" role="alert" aria-live="assertive">
          {message}
        </p>
        {props.onRetry && (
          <button
            type="button"
            onClick={props.onRetry}
            className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
