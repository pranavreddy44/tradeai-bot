'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        {/* Tabs skeleton */}
        <Skeleton className="h-9 w-full rounded-lg" />
        {/* Content skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-10 w-48 rounded-lg" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

const emptySubscribe = () => () => {}

let DashboardModule: React.ComponentType | null = null

function LazyDashboard() {
  const [Dashboard, setDashboard] = useState<React.ComponentType | null>(DashboardModule)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (Dashboard) return

    import('@/components/autotrade-dashboard')
      .then((mod) => {
        DashboardModule = mod.AutoTradeDashboard
        setDashboard(() => mod.AutoTradeDashboard)
      })
      .catch((err) => {
        console.error('Failed to load dashboard:', err)
        setError(err.message)
      })
  }, [Dashboard])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-500">Failed to load dashboard</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => { setError(null); setDashboard(null) }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!Dashboard) {
    return <DashboardSkeleton />
  }

  return <Dashboard />
}

export default function Home() {
  // Use useSyncExternalStore to detect client-side mounting without triggering
  // the "setState in effect" lint rule
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  if (!mounted) {
    return <DashboardSkeleton />
  }

  return <LazyDashboard />
}
