export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h2 className="text-xl font-semibold">404 — Page Not Found</h2>
      <a href="/dashboard" className="btn-secondary">Go to Dashboard</a>
    </div>
  )
}
