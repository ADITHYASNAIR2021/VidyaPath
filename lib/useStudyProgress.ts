import { useState, useEffect } from 'react';

const STORAGE_KEY = 'vidyapath_study_progress';

export function useStudyProgress() {
  const [completedChapters, setCompletedChapters] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCompletedChapters(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load study progress from local storage', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to local storage whenever progress changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(completedChapters));
      } catch (e) {
        console.error('Failed to save study progress to local storage', e);
      }
    }
  }, [completedChapters, isLoaded]);

  const toggleChapter = (chapterId: string) => {
    setCompletedChapters((prev) => {
      if (prev.includes(chapterId)) {
        return prev.filter((id) => id !== chapterId);
      } else {
        return [...prev, chapterId];
      }
    });
  };

  const isCompleted = (chapterId: string) => {
    return completedChapters.includes(chapterId);
  };

  return { completedChapters, toggleChapter, isCompleted, isLoaded };
}
