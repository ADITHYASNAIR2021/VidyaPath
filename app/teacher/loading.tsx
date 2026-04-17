export default function TeacherDashboardLoading() {
  return (
    <div className="min-h-screen bg-[#FDFAF6] animate-pulse">
      {/* Header skeleton */}
      <div className="bg-white border-b border-[#E8E4DC] px-6 py-4 flex items-center gap-4">
        <div className="h-8 w-32 bg-gray-200 rounded-lg" />
        <div className="h-8 w-48 bg-gray-100 rounded-lg ml-auto" />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E8E4DC] p-5">
              <div className="h-4 w-20 bg-gray-200 rounded mb-3" />
              <div className="h-7 w-12 bg-gray-300 rounded" />
            </div>
          ))}
        </div>

        {/* Assignment packs skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E8E4DC] p-5 flex items-center gap-4">
              <div className="h-10 w-10 bg-gray-200 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-64 bg-gray-100 rounded" />
              </div>
              <div className="h-7 w-20 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>

        {/* Submissions table skeleton */}
        <div className="bg-white rounded-2xl border border-[#E8E4DC] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8E4DC]">
            <div className="h-5 w-36 bg-gray-200 rounded" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-[#F0EDE8] flex items-center gap-4">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="h-4 w-20 bg-gray-100 rounded ml-auto" />
              <div className="h-6 w-16 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
