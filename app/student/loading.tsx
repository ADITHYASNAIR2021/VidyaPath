export default function StudentDashboardLoading() {
  return (
    <div className="min-h-screen bg-[#FDFAF6] animate-pulse">
      {/* Header skeleton */}
      <div className="bg-white border-b border-[#E8E4DC] px-4 py-4 flex items-center gap-3">
        <div className="h-8 w-28 bg-gray-200 rounded-lg" />
        <div className="h-8 w-8 bg-gray-100 rounded-full ml-auto" />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Greeting skeleton */}
        <div className="space-y-2">
          <div className="h-6 w-52 bg-gray-300 rounded" />
          <div className="h-4 w-72 bg-gray-200 rounded" />
        </div>

        {/* Active assignments skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-44 bg-gray-200 rounded" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E8E4DC] p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 bg-indigo-100 rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-8 w-24 bg-indigo-100 rounded-xl" />
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-indigo-200 rounded-full" />
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E8E4DC] p-4">
              <div className="h-8 w-8 bg-gray-200 rounded-xl mb-3" />
              <div className="h-4 w-20 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
