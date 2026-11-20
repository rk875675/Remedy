import { ChapterOpen } from '../../components/onboarding/coldopen/ChapterOpen';
import { useObStep } from '../../lib/onboardingFlow';

const COPY = {
  title: 'Now the back itself.',
  cta: 'My back',
} as const;

export default function OpenBackScreen() {
  const { chapter, goNext } = useObStep('open_back');
  if (chapter == null) return null;

  return (
    <ChapterOpen
      chapter={chapter}
      title={COPY.title}
      mood="inspect"
      cta={COPY.cta}
      onContinue={goNext}
    />
  );
}
