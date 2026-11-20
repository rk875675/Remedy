import { ChapterOpen } from '../../components/onboarding/coldopen/ChapterOpen';
import { useObStep } from '../../lib/onboardingFlow';

export default function OpenGoalsScreen() {
  const { chapter, goNext } = useObStep('open_goals');
  if (chapter == null) return null;

  return (
    <ChapterOpen
      chapter={chapter}
      title="What do you want from your back?"
      mood="notes"
      cta="The goal"
      onContinue={goNext}
    />
  );
}
