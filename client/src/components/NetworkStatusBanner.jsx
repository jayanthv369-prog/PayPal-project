import React from 'react';
import { useNetwork, NETWORK_MODES } from '../context/NetworkContext';
import { Wifi, WifiOff, Activity, AlertOctagon, RefreshCw } from 'lucide-react';

export default function NetworkStatusBanner() {
  const { networkMode, setNetworkMode, isSimulatedOffline } = useNetwork();

  return (
    <div className="bg-[#0b1324] border-b border-slate-800/80 px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Current Network Health */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-medium text-slate-300">
            <span className="relative flex h-2.5 w-2.5">
              {networkMode.id === 'ONLINE' ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </>
              ) : networkMode.id === 'OFFLINE' ? (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-500"></span>
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </>
              )}
            </span>
            <span>Network Resilience Engine:</span>
          </div>

          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold flex items-center gap-1 ${networkMode.color}`}>
            {networkMode.id === 'ONLINE' && <Wifi className="w-3 h-3" />}
            {networkMode.id === 'FLAKY_3G' && <Activity className="w-3 h-3 animate-spin" />}
            {networkMode.id === 'TIMEOUT' && <AlertOctagon className="w-3 h-3" />}
            {networkMode.id === 'OFFLINE' && <WifiOff className="w-3 h-3" />}
            {networkMode.label}
          </span>

          <span className="hidden md:inline text-slate-400 text-[11px]">
            {networkMode.id === 'ONLINE' && '(Normal SLA • ~40ms)'}
            {networkMode.id === 'FLAKY_3G' && '(3200ms latency • 25% drop probability)'}
            {networkMode.id === 'TIMEOUT' && '(Simulates upstream bank switch 504 timeout)'}
            {networkMode.id === 'OFFLINE' && '(Zero connectivity • Offline Passports active)'}
          </span>
        </div>

        {/* Right: Interactive Switcher for Judges / Demo */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          <span className="text-slate-400 text-[11px] px-2 font-mono hidden sm:inline">Simulate Condition:</span>
          {Object.values(NETWORK_MODES).map((mode) => {
            const isSelected = networkMode.id === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setNetworkMode(mode)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  isSelected
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {mode.id === 'ONLINE' && 'Optimal'}
                {mode.id === 'FLAKY_3G' && 'Flaky 3G'}
                {mode.id === 'TIMEOUT' && 'Timeout Drop'}
                {mode.id === 'OFFLINE' && 'Offline'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
