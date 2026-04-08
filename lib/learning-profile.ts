export interface LearningProfile {
  chapterId: string;
  quizScore: number | null;
  flashcardsDue: number;
  studied: boolean;
  bookmarked: boolean;
  pyqAvgMarks: number;
  weakTags: string[];
  recommendedActions: string[];
}

export interface LearningProfileInput {
  chapterId: string;
  quizScore: number | null;
  flashcardsDue: number;
  studied: boolean;
  bookmarked: boolean;
  pyqAvgMarks?: number;
}

export function buildLearningProfile(input: LearningProfileInput): LearningProfile {
  const pyqAvgMarks = input.pyqAvgMarks ?? 0;
  const weakTags: string[] = [];

  if (input.quizScore !== null && input.quizScore < 60) weakTags.push('Low Quiz Accuracy');
  if (input.flashcardsDue >= 8) weakTags.push('High Recall Debt');
  if (!input.studied) weakTags.push('Not Marked Studied');
  if (pyqAvgMarks >= 8 && (input.quizScore ?? 100) < 75) weakTags.push('High-Yield Risk');

  const recommendedActions: string[] = [];
  if (weakTags.includes('Low Quiz Accuracy')) recommendedActions.push('Run a fresh adaptive MCQ test on this chapter.');
  if (weakTags.includes('High Recall Debt')) recommendedActions.push('Clear due flashcards before attempting another timed test.');
  if (weakTags.includes('High-Yield Risk')) recommendedActions.push('Prioritize PYQ-heavy topics first this week.');
  if (!input.studied) recommendedActions.push('Complete one focused Pomodoro and mark chapter as studied.');
  if (recommendedActions.length === 0) recommendedActions.push('Maintain momentum with one mixed-revision mini test.');

  return {
    chapterId: input.chapterId,
    quizScore: input.quizScore,
    flashcardsDue: input.flashcardsDue,
    studied: input.studied,
    bookmarked: input.bookmarked,
    pyqAvgMarks,
    weakTags,
    recommendedActions,
  };
}

export function rankWeakChapters(profiles: LearningProfile[]): LearningProfile[] {
  return [...profiles].sort((a, b) => {
    const riskA = a.weakTags.length * 10 + (a.pyqAvgMarks >= 8 ? 5 : 0) + (a.quizScore !== null ? Math.max(0, 80 - a.quizScore) : 12);
    const riskB = b.weakTags.length * 10 + (b.pyqAvgMarks >= 8 ? 5 : 0) + (b.quizScore !== null ? Math.max(0, 80 - b.quizScore) : 12);
    return riskB - riskA;
  });
}
