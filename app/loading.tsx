export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FDFAF6] flex flex-col items-center justify-center">
      <div className="w-16 h-16 border-4 border-saffron-200 border-t-saffron-500 rounded-full animate-spin"></div>
      <p className="mt-4 text-navy-700 font-medium text-sm animate-pulse">Loading content...</p>
    </div>
  );
}
