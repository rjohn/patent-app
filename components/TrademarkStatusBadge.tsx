const CLASS: Record<string, string> = {
  REGISTERED: 'status-granted', PENDING: 'status-pending',
  ABANDONED: 'status-abandoned', CANCELLED: 'status-abandoned', EXPIRED: 'status-expired', UNKNOWN: 'status-expired',
}

export default function TrademarkStatusBadge({ status }: { status: string }) {
  return <span className={CLASS[status] || 'status-expired'}>{status === 'UNKNOWN' ? 'AWAITING DATA' : status}</span>
}
