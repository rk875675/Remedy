import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { isPremium, isDevUser } from '../lib/entitlements';

type PremiumContextType = {
  premium: boolean | null;
  refreshPremium: () => Promise<void>;
};

const PremiumContext = createContext<PremiumContextType>({
  premium: null,
  refreshPremium: async () => {},
});

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [premium, setPremium] = useState<boolean | null>(null);

  const refreshPremium = useCallback(async () => {
    if (!session) {
      setPremium(null);
      return;
    }
    const [prem, dev] = await Promise.all([
      isPremium(session.user.id),
      isDevUser(session.user.id),
    ]);
    setPremium(prem || dev);
  }, [session]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setPremium(null);
      return;
    }
    refreshPremium();
  }, [session, loading, refreshPremium]);

  return (
    <PremiumContext.Provider value={{ premium, refreshPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  return useContext(PremiumContext);
}
