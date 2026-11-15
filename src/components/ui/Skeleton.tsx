import React from 'react'

interface SkeletonBaseProps {
  className?: string
  style?: React.CSSProperties
}

export const SkeletonBlock: React.FC<SkeletonBaseProps> = ({ className = '', style }) => (
  <div
    aria-hidden="true"
    style={style}
    className={`relative overflow-hidden bg-surface-2 rounded-xl skeleton-shimmer ${className}`}
  />
)

export const SkeletonText: React.FC<SkeletonBaseProps & { width?: string }> = ({
  className = '',
  width = 'w-2/3',
  style
}) => (
  <div
    aria-hidden="true"
    style={style}
    className={`relative overflow-hidden h-3.5 bg-surface-2 rounded-md skeleton-shimmer ${width} ${className}`}
  />
)

export const SkeletonStatTile: React.FC<SkeletonBaseProps> = ({ className = '', style }) => (
  <div
    aria-hidden="true"
    style={style}
    className={`p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between gap-3 ${className}`}
  >
    <div className="flex items-center justify-between">
      <SkeletonText width="w-24" className="h-3" />
      <SkeletonBlock className="w-8 h-8 rounded-xl" />
    </div>
    <div className="space-y-2 pt-1">
      <SkeletonBlock className="w-20 h-7 rounded-lg" />
      <SkeletonText width="w-32" className="h-2.5" />
    </div>
  </div>
)

export const SkeletonCard: React.FC<SkeletonBaseProps> = ({ className = '', style }) => (
  <div
    aria-hidden="true"
    style={style}
    className={`p-6 rounded-2xl bg-surface border border-border flex flex-col justify-between gap-5 ${className}`}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3.5 flex-1">
        <SkeletonBlock className="w-12 h-12 rounded-xl shrink-0" />
        <div className="space-y-2 flex-1">
          <SkeletonText width="w-3/5" className="h-4" />
          <SkeletonText width="w-2/5" className="h-3" />
        </div>
      </div>
      <SkeletonBlock className="w-16 h-6 rounded-lg shrink-0" />
    </div>
    <div className="space-y-2.5">
      <SkeletonBlock className="w-full h-14 rounded-xl" />
      <div className="flex items-center justify-between pt-1">
        <SkeletonText width="w-24" className="h-3" />
        <SkeletonText width="w-16" className="h-3" />
      </div>
    </div>
  </div>
)

export const SkeletonTableRow: React.FC<{ columns?: number; className?: string }> = ({
  columns = 6,
  className = ''
}) => (
  <tr aria-hidden="true" className={`border-b border-border/60 ${className}`}>
    {Array.from({ length: columns }).map((_, idx) => (
      <td key={idx} className="px-4 py-3.5">
        {idx === 0 ? (
          <div className="flex items-center gap-3">
            <SkeletonBlock className="w-9 h-9 rounded-xl shrink-0" />
            <div className="space-y-1.5 flex-1 min-w-[110px]">
              <SkeletonText width="w-28" className="h-3.5" />
              <SkeletonText width="w-16" className="h-2.5" />
            </div>
          </div>
        ) : idx === columns - 1 ? (
          <div className="flex justify-end gap-2">
            <SkeletonBlock className="w-16 h-7 rounded-lg" />
          </div>
        ) : (
          <SkeletonText width={idx % 2 === 0 ? 'w-20' : 'w-16'} className="h-3.5" />
        )}
      </td>
    ))}
  </tr>
)

export const AdminDashboardSkeleton: React.FC = () => (
  <div aria-hidden="true" className="space-y-8">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-border">
      <div className="space-y-2">
        <SkeletonText width="w-28" className="h-3" />
        <SkeletonBlock className="w-56 h-8 rounded-lg" />
      </div>
      <div className="flex items-center gap-2.5">
        <SkeletonBlock className="w-28 h-9 rounded-xl" />
        <SkeletonBlock className="w-28 h-9 rounded-xl" />
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <SkeletonStatTile />
      <SkeletonStatTile />
      <SkeletonStatTile />
      <SkeletonStatTile />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <SkeletonCard className="lg:col-span-2 min-h-[260px]" />
      <SkeletonCard className="min-h-[260px]" />
    </div>
  </div>
)

export const AdminTableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 6,
  columns = 6
}) => (
  <div aria-hidden="true" className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-border">
      <div className="space-y-2">
        <SkeletonText width="w-28" className="h-3" />
        <SkeletonBlock className="w-52 h-8 rounded-lg" />
      </div>
      <div className="flex items-center gap-2.5">
        <SkeletonBlock className="w-32 h-9 rounded-xl" />
      </div>
    </div>

    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <SkeletonBlock className="w-64 h-9 rounded-xl" />
        <div className="flex items-center gap-2">
          <SkeletonBlock className="w-24 h-9 rounded-xl" />
          <SkeletonBlock className="w-24 h-9 rounded-xl" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
)

export const AdminCardsSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div aria-hidden="true" className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-border">
      <div className="space-y-2">
        <SkeletonText width="w-28" className="h-3" />
        <SkeletonBlock className="w-52 h-8 rounded-lg" />
      </div>
      <SkeletonBlock className="w-32 h-9 rounded-xl" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  </div>
)

export const AdminShellSkeleton: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div
    aria-hidden="true"
    className="min-h-screen bg-bg text-text font-sans flex flex-col md:flex-row antialiased"
  >
    <aside className="hidden md:flex flex-col justify-between bg-surface border-r border-border shrink-0 w-64 lg:w-72 p-5">
      <div className="flex flex-col gap-5">
        <div className="pb-4 border-b border-border flex items-center justify-between">
          <SkeletonBlock className="w-28 h-8 rounded-lg" />
          <div className="flex items-center gap-1.5">
            <SkeletonBlock className="w-8 h-8 rounded-xl" />
            <SkeletonBlock className="w-8 h-8 rounded-xl" />
          </div>
        </div>
        <SkeletonBlock className="w-full h-20 rounded-xl" />
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="w-full h-[42px] rounded-xl" />
          ))}
        </div>
      </div>
      <div className="pt-4 border-t border-border flex flex-col gap-2.5">
        <SkeletonBlock className="w-full h-[42px] rounded-xl" />
        <SkeletonBlock className="w-full h-[42px] rounded-xl" />
      </div>
    </aside>

    <div className="md:hidden bg-surface border-b border-border p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-9 h-9 rounded-xl" />
        <SkeletonBlock className="w-20 h-7 rounded-lg" />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="w-9 h-9 rounded-xl" />
        <SkeletonBlock className="w-9 h-9 rounded-xl" />
      </div>
    </div>

    <main className="flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10 md:pr-40 lg:pr-44 max-w-7xl mx-auto w-full">
      {children || <AdminDashboardSkeleton />}
    </main>
  </div>
)

export const PublicPageSkeleton: React.FC<{ variant?: 'cards' | 'profile' | 'content' | 'home' }> = ({
  variant = 'cards'
}) => (
  <div aria-hidden="true" className="min-h-screen bg-bg text-text flex flex-col">
    <header className="w-full px-6 md:px-12 py-5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-[52px] h-[52px] rounded-[22%]" />
        <SkeletonBlock className="w-24 h-6 rounded-lg hidden sm:block" />
      </div>
      <SkeletonBlock className="w-28 h-8 rounded-full" />
    </header>

    <main className="flex-1 w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 pt-12 pb-20 space-y-10">
      <div className="space-y-3 pb-6 border-b border-border">
        <SkeletonText width="w-28" className="h-3" />
        <SkeletonBlock className="w-64 sm:w-80 h-10 rounded-xl" />
        <SkeletonText width="w-72" className="h-3.5" />
      </div>

      {variant === 'profile' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="min-h-[280px]" />
          <SkeletonCard className="lg:col-span-2 min-h-[280px]" />
        </div>
      ) : variant === 'content' ? (
        <div className="space-y-4 max-w-3xl">
          <SkeletonBlock className="w-full h-36 rounded-2xl" />
          <SkeletonBlock className="w-full h-48 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} className="min-h-[220px]" />
          ))}
        </div>
      )}
    </main>
  </div>
)

export const ProjectorPageSkeleton: React.FC = () => (
  <div
    aria-hidden="true"
    data-theme="dark"
    className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between p-8 lg:p-14"
  >
    <div className="flex items-center justify-between">
      <SkeletonBlock className="w-36 h-9 rounded-xl bg-[#1A1D1A]" />
      <SkeletonBlock className="w-44 h-9 rounded-full bg-[#1A1D1A]" />
    </div>
    <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto">
      <SkeletonBlock className="lg:col-span-5 aspect-[4/5] rounded-3xl bg-[#1A1D1A]" />
      <div className="lg:col-span-7 space-y-5">
        <SkeletonBlock className="w-32 h-6 rounded-full bg-[#1A1D1A]" />
        <SkeletonBlock className="w-3/4 h-14 rounded-2xl bg-[#1A1D1A]" />
        <SkeletonBlock className="w-1/2 h-8 rounded-xl bg-[#1A1D1A]" />
        <div className="grid grid-cols-2 gap-4 pt-4">
          <SkeletonBlock className="h-28 rounded-2xl bg-[#1A1D1A]" />
          <SkeletonBlock className="h-28 rounded-2xl bg-[#1A1D1A]" />
        </div>
      </div>
    </div>
    <div className="flex items-center justify-between pt-6 border-t border-white/10">
      <SkeletonBlock className="w-48 h-4 rounded-md bg-[#1A1D1A]" />
      <SkeletonBlock className="w-32 h-4 rounded-md bg-[#1A1D1A]" />
    </div>
  </div>
)
