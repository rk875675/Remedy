import React, { createContext, useContext, useState } from 'react';
import type { OnboardingAnswers } from '../types/database';

type AnswerFields = Omit<OnboardingAnswers, 'id' | 'user_id' | 'completed_at' | 'created_at'>;

type OnboardingContextType = {
  answers: Partial<AnswerFields>;
  setAnswer: <K extends keyof AnswerFields>(field: K, value: AnswerFields[K]) => void;
  resetAnswers: () => void;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [answers, setAnswers] = useState<Partial<AnswerFields>>({});

  function setAnswer<K extends keyof AnswerFields>(field: K, value: AnswerFields[K]) {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  }

  function resetAnswers() {
    setAnswers({});
  }

  return (
    <OnboardingContext.Provider value={{ answers, setAnswer, resetAnswers }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}
