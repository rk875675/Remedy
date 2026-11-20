// Citations the onboarding screens may show. Figures are copied from the
// research notes. Do not add a number that is not in those files.

export type SourceKey =
  | 'pet'
  | 'outlook'
  | 'restore'
  | 'acp'
  | 'nice'
  | 'who'
  | 'prevention'
  | 'dose'
  | 'adherence';

export const ONBOARDING_SOURCES: Record<SourceKey, { title: string; detail: string }> = {
  pet: {
    title: 'Mazeas A, Duclos M, Pereira B, Chalabaev A. J Med Internet Res. 2022',
    detail:
      '16 RCTs, 2,407 participants. Gamified interventions vs control on physical activity: Hedges g = 0.42 (0.14-0.69).',
  },
  outlook: {
    title: 'da C Menezes Costa L, Maher CG, Hancock MJ, McAuley JH, Herbert RD, Costa LOP. CMAJ. 2012',
    detail:
      '33 cohorts, 11,166 people. Acute pain out of 100: 52 at onset, 23 at 6 weeks, 12 at 26 weeks, 6 at 52 weeks. Persistent pain: 51, then 33, 26, and 23.',
  },
  restore: {
    title: 'Kent P et al. Lancet. 2023',
    detail: 'RESTORE trial. n = 492: CFT only 164, CFT plus movement-sensor biofeedback 163, usual care 165.',
  },
  acp: {
    title: 'Qaseem A, et al. Ann Intern Med. 2017',
    detail:
      'For chronic low back pain, clinicians and patients should initially select nonpharmacologic treatment with exercise.',
  },
  nice: {
    title: 'NICE NG59, 2016',
    detail:
      'Consider a group exercise programme (biomechanical, aerobic, mind-body or a combination of approaches).',
  },
  who: {
    title: 'WHO, 2023',
    detail:
      'A structured exercise therapy or programme may be offered as part of care to adults, including older people, with chronic primary low back pain. Conditional recommendation, low-certainty evidence.',
  },
  prevention: {
    title: 'Steffens D, Maher CG, Pereira LS, et al. JAMA Intern Med. 2016',
    detail: 'Exercise combined with education: risk of an episode RR 0.55 (0.41-0.74).',
  },
  dose: {
    title: 'Müller J, Niederer D. Sci Rep. 2020',
    detail: '50 studies, 2,786 patients. Sessions of 20-30 min had the largest effect.',
  },
  adherence: {
    title:
      'Medina-Mirapeix F, Escolar-Reina P, Gascón-Cánovas JJ, Montilla-Herrador J, Jimeno-Serrano FJ, Collins SM. BMC Musculoskelet Disord. 2009',
    detail: 'More than 6 exercises vs 3 or fewer: odds of frequency adherence OR 0.2 (0.1-0.9).',
  },
};
