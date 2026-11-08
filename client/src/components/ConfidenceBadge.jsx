import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, ShieldCheck, XCircle, ShieldAlert } from 'lucide-react';

export const STATUS_CONFIGS = {
  CONFIRMED: {
    label: 'Confirmed',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
    icon: CheckCircle2,
    shortDesc: 'Settled by clearinghouse. No duplicate risk.',
  },
  PENDING_VERIFICATION: {
    label: 'Pending Verification',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dotClass: 'bg-amber-400 animate-pulse',
    icon: Clock,
    shortDesc: 'Bank ACK delayed. Polling provider before retry.',
  },
  OUTCOME_UNKNOWN: {
    label: 'Outcome Unknown',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    dotClass: 'bg-orange-400 animate-ping',
    icon: AlertTriangle,
    shortDesc: 'Network dropped mid-flight. Do NOT retry yet.',
  },
  OFFLINE_AUTHORIZATION: {
    label: 'Offline Authorization',
    badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    dotClass: 'bg-sky-400',
    icon: ShieldCheck,
    shortDesc: 'Cryptographically signed. Settlement pending.',
  },
  FAILED: {
    label: 'Failed',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    dotClass: 'bg-rose-400',
    icon: XCircle,
    shortDesc: 'Payment rejected. No debit. Safe to retry.',
  },
  NEEDS_REVIEW: {
    label: 'Needs Review',
    badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    dotClass: 'bg-purple-400 animate-pulse',
    icon: ShieldAlert,
    shortDesc: 'Risk anomaly detected. Review Scam Guardian.',
  },
};

export default function ConfidenceBadge({ state, onClick, size = 'md' }) {
  const config = STATUS_CONFIGS[state] || STATUS_CONFIGS.OUTCOME_UNKNOWN;
  const Icon = config.icon;

  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5 gap-1.5' 
    : 'text-xs md:text-sm px-2.5 py-1 gap-2';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center font-medium rounded-full border transition-all ${config.badgeClass} ${sizeClasses} ${onClick ? 'hover:brightness-110 cursor-pointer' : 'cursor-default'}`}
      title="Click to view full diagnosis and recovery guidance"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{config.label}</span>
    </button>
  );
}
