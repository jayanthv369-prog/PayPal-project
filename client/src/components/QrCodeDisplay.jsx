import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, Clock, AlertTriangle, KeyRound, Copy, Check } from 'lucide-react';

export default function QrCodeDisplay({ passportData }) {
  const [copied, setCopied] = React.useState(false);

  if (!passportData) return null;

  const jsonString = JSON.stringify(passportData);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = Date.now() > new Date(passportData.expiresAt).getTime();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center text-center relative overflow-hidden shadow-xl">
      {/* Pending Settlement Disclaimer Ribbon */}
      <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-400 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mb-5">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>SETTLEMENT PENDING • NOT A FINAL PAYMENT</span>
      </div>

      {/* QR Code Container */}
      <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-200 relative">
        <QRCodeSVG
          value={jsonString}
          size={210}
          level="M"
          includeMargin={true}
        />
        {isExpired && (
          <div className="absolute inset-0 bg-rose-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center text-rose-300 p-4">
            <AlertTriangle className="w-10 h-10 text-rose-400 mb-1" />
            <span className="font-bold text-sm">EXPIRED TOKEN</span>
            <span className="text-[11px] text-rose-200">Terminal will reject</span>
          </div>
        )}
      </div>

      {/* Auth Meta Details */}
      <div className="mt-5 w-full space-y-2 text-xs">
        <div className="flex items-center justify-between py-1 border-b border-slate-800">
          <span className="text-slate-400">Authorized Limit:</span>
          <span className="text-emerald-400 font-bold text-sm">₹{Number(passportData.amount).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between py-1 border-b border-slate-800">
          <span className="text-slate-400">Recipient Restricted To:</span>
          <span className="text-slate-200 font-medium font-mono text-[11px]">{passportData.recipientId}</span>
        </div>
        <div className="flex items-center justify-between py-1 border-b border-slate-800">
          <span className="text-slate-400">Nonce (Replay Safe):</span>
          <span className="text-sky-300 font-mono text-[11px] truncate max-w-[140px]">{passportData.nonce}</span>
        </div>
        <div className="flex items-center justify-between py-1 border-b border-slate-800">
          <span className="text-slate-400">Expires At:</span>
          <span className="text-amber-300 font-medium font-mono text-[11px]">
            {new Date(passportData.expiresAt).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400">HMAC-SHA256 Signature:</span>
          <span className="text-slate-500 font-mono text-[10px] truncate max-w-[140px]">
            {passportData.signature ? `${passportData.signature.substring(0, 16)}...` : 'Pending'}
          </span>
        </div>
      </div>

      {/* Copy Raw Payload Button */}
      <button
        onClick={handleCopy}
        className="mt-4 w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700 transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        <span>{copied ? 'Copied QR Payload!' : 'Copy Raw Cryptographic Payload'}</span>
      </button>
    </div>
  );
}
