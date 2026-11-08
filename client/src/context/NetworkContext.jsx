import React, { createContext, useContext, useState, useEffect } from 'react';

const NetworkContext = createContext();

export const NETWORK_MODES = {
  ONLINE: { id: 'ONLINE', label: 'Online (Optimal)', latency: 50, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  FLAKY_3G: { id: 'FLAKY_3G', label: 'Flaky 3G (High Latency)', latency: 3200, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  TIMEOUT: { id: 'TIMEOUT', label: 'Gateway Timeout (Drop ACK)', latency: 5000, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  OFFLINE: { id: 'OFFLINE', label: 'Completely Offline', latency: 0, color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' },
};

export function NetworkProvider({ children }) {
  const [networkMode, setNetworkMode] = useState(NETWORK_MODES.ONLINE);
  const [isNativeOnline, setIsNativeOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsNativeOnline(true);
    const handleOffline = () => {
      setIsNativeOnline(false);
      setNetworkMode(NETWORK_MODES.OFFLINE);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isSimulatedOffline = networkMode.id === 'OFFLINE' || !isNativeOnline;

  /**
   * Helper that simulates real network latency and drops according to active mode
   */
  const simulateNetworkRequest = async (actionFn) => {
    if (isSimulatedOffline) {
      throw new Error('NETWORK_DISCONNECTED: Device is completely offline. Use Offline Payment Passport.');
    }

    if (networkMode.id === 'FLAKY_3G') {
      await new Promise(r => setTimeout(r, 2800));
      // 25% chance of random packet loss
      if (Math.random() < 0.25) {
        throw new Error('PACKET_LOSS: Connection timed out on unstable 3G cell tower.');
      }
    } else if (networkMode.id === 'TIMEOUT') {
      await new Promise(r => setTimeout(r, 3500));
      throw new Error('GATEWAY_TIMEOUT: Bank payment switch did not respond within SLA (504 Gateway Timeout).');
    } else {
      // Normal online
      await new Promise(r => setTimeout(r, 300));
    }

    return actionFn ? await actionFn() : true;
  };

  return (
    <NetworkContext.Provider
      value={{
        networkMode,
        setNetworkMode,
        isSimulatedOffline,
        isNativeOnline,
        simulateNetworkRequest,
        NETWORK_MODES,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used within NetworkProvider');
  return context;
}
