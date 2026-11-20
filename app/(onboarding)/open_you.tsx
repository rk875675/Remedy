import { ChapterOpen } from '../../components/onboarding/coldopen/ChapterOpen';
import { useObStep } from '../../lib/onboardingFlow';

const COPY = {
  title: 'Then we build the plan.',
  cta: 'About me',
} as const;

export default function OpenYouScreen() {
  const { chapter, goNext } = useObStep('open_you');
  if (chapter == null) return null;

  return (
    <ChapterOpen
      chapter={chapter}
      title={COPY.title}
      mood="thinking"
      cta={COPY.cta}
      onContinue={goNext}
    />
  );
}
