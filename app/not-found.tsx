import Link from 'next/link';
import { Home, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FDFAF6] flex flex-col items-center justify-center px-4 text-center">
      <div className="text-[120px] font-fraunces font-bold text-navy-700/10 leading-none">404</div>
      <h1 className="font-fraunces text-3xl font-bold text-navy-700 mt-4 mb-2">Page not found</h1>
      <p className="text-[#8A8AAA] max-w-sm mb-8">
        We couldn&apos;t find the page you were looking for. It might have been moved or doesn&apos;t exist.
      </p>
      
      <div className="flex flex-col sm:flex-row gap-3">
        <Link 
          href="/"
          className="flex items-center justify-center gap-2 bg-saffron-500 hover:bg-saffron-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Home
        </Link>
        <Link 
          href="/chapters"
          className="flex items-center justify-center gap-2 bg-white text-navy-700 hover:bg-gray-50 font-semibold px-6 py-3 rounded-xl border border-[#E8E4DC] transition-colors"
        >
          <Compass className="w-4 h-4" />
          Browse Chapters
        </Link>
      </div>
    </div>
  );
}
