import { ChapterOpen } from '../../components/onboarding/coldopen/ChapterOpen';
import { useObStep } from '../../lib/onboardingFlow';

const COPY = {
  title: 'How it behaves.',
  cta: 'The pattern',
} as const;

export default function OpenPatternScreen() {
  const { chapter, goNext } = useObStep('open_pattern');
  if (chapter == null) return null;

  return (
    <ChapterOpen
      chapter={chapter}
      title={COPY.title}
      mood="clipboard"
      cta={COPY.cta}
      onContinue={goNext}
    />
  );
}
