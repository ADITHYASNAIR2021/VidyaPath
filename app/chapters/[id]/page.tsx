import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Play,
  BookOpen,
  CheckCircle2,
  Atom,
  FlaskConical,
  Leaf,
  Calculator,
  Briefcase,
  LineChart,
  ClipboardList,
  Target,
  ChevronRight,
  TrendingUp,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { ALL_CHAPTERS, getChapterById, getAdjacentChapters } from '@/lib/data';
import { getPYQData, getFrequencyLabel } from '@/lib/pyq';
import { chapterNotesSlug, slugify } from '@/lib/seo-notes';
import AIChatBox from '@/components/AIChatBox';
import BookmarkButton from '@/components/BookmarkButton';
import StudiedButton from '@/components/StudiedButton';
import FormulaCard from '@/components/FormulaCard';
import MermaidRenderer from '@/components/MermaidRenderer';
import TextToSpeechButton from '@/components/TextToSpeechButton';
import PomodoroTimer from '@/components/PomodoroTimer';
import ChapterNotes from '@/components/ChapterNotes';
import InlinePDFViewer from '@/components/InlinePDFViewer';
import QuizEngine from '@/components/QuizEngine';
import FlashcardDeck from '@/components/FlashcardDeck';
import LearningProfileInsights from '@/components/LearningProfileInsights';
import ChapterIntelligenceHub from '@/components/ChapterIntelligenceHub';
import TeacherChapterPanel from '@/components/TeacherChapterPanel';
import ImageQuestionSolver from '@/components/ImageQuestionSolver';
import AnalyticsTracker from '@/components/AnalyticsTracker';

// Generate static params for all chapters
export function generateStaticParams() {
  return ALL_CHAPTERS.map((ch) => ({ id: ch.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const chapter = getChapterById(params.id);
  if (!chapter) {
    return {
      title: 'Chapter Not Found | VidyaPath',
      description: 'Requested chapter was not found.',
    };
  }
  return {
    title: `${chapter.title} - Class ${chapter.classLevel} ${chapter.subject} Notes`,
    description: `${chapter.title} (Class ${chapter.classLevel} ${chapter.subject}) with key topics, formulas, PYQ analysis, AI tutor, and study tools.`,
    openGraph: {
      title: `${chapter.title} | VidyaPath`,
      description: `Class ${chapter.classLevel} ${chapter.subject} - ${chapter.marks} marks - Board-focused prep.`,
      images: [`/chapters/${chapter.id}/opengraph-image`],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${chapter.title} | VidyaPath`,
      description: `Class ${chapter.classLevel} ${chapter.subject} - ${chapter.marks} marks`,
      images: [`/chapters/${chapter.id}/opengraph-image`],
    },
  };
}

const SUBJECT_STYLES: Record<
  string,
  { header: string; badge: string; topicBg: string; icon: React.ElementType; accentBg: string }
> = {
  Physics: {
    header: 'from-sky-600 to-sky-700',
    badge: 'bg-sky-100 text-sky-700',
    topicBg: 'bg-sky-50 border-sky-100 text-sky-700',
    accentBg: 'bg-sky-50 border-sky-100',
    icon: Atom,
  },
  Chemistry: {
    header: 'from-emerald-600 to-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
    topicBg: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    accentBg: 'bg-emerald-50 border-emerald-100',
    icon: FlaskConical,
  },
  Biology: {
    header: 'from-green-600 to-green-700',
    badge: 'bg-green-100 text-green-700',
    topicBg: 'bg-green-50 border-green-100 text-green-700',
    accentBg: 'bg-green-50 border-green-100',
    icon: Leaf,
  },
  Math: {
    header: 'from-purple-600 to-purple-700',
    badge: 'bg-purple-100 text-purple-700',
    topicBg: 'bg-purple-50 border-purple-100 text-purple-700',
    accentBg: 'bg-purple-50 border-purple-100',
    icon: Calculator,
  },
  Accountancy: {
    header: 'from-amber-600 to-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    topicBg: 'bg-amber-50 border-amber-100 text-amber-700',
    accentBg: 'bg-amber-50 border-amber-100',
    icon: Briefcase,
  },
  'Business Studies': {
    header: 'from-indigo-600 to-indigo-700',
    badge: 'bg-indigo-100 text-indigo-700',
    topicBg: 'bg-indigo-50 border-indigo-100 text-indigo-700',
    accentBg: 'bg-indigo-50 border-indigo-100',
    icon: LineChart,
  },
  Economics: {
    header: 'from-rose-600 to-rose-700',
    badge: 'bg-rose-100 text-rose-700',
    topicBg: 'bg-rose-50 border-rose-100 text-rose-700',
    accentBg: 'bg-rose-50 border-rose-100',
    icon: LineChart,
  },
  'English Core': {
    header: 'from-cyan-600 to-cyan-700',
    badge: 'bg-cyan-100 text-cyan-700',
    topicBg: 'bg-cyan-50 border-cyan-100 text-cyan-700',
    accentBg: 'bg-cyan-50 border-cyan-100',
    icon: BookOpen,
  },
};

const RELEVANCE_STYLES: Record<string, string> = {
  Board: 'bg-amber-50 text-amber-700 border-amber-200',
  JEE: 'bg-sky-50 text-sky-700 border-sky-200',
  NEET: 'bg-green-50 text-green-700 border-green-200',
};

const RELEVANCE_DESC: Record<string, string> = {
  Board: 'Tested in CBSE board exams',
  JEE: 'Asked in JEE Main & Advanced',
  NEET: 'Important for NEET-UG',
};

export default function ChapterDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { section?: string };
}) {
  const chapter = getChapterById(params.id);
  if (!chapter) notFound();

  const { prev, next } = getAdjacentChapters(params.id);
  const style = SUBJECT_STYLES[chapter.subject] ?? SUBJECT_STYLES.Physics;
  const SubjectIcon = style.icon ?? Atom;
  const section = typeof searchParams?.section === 'string' ? searchParams.section.trim() : '';
  const chapterPyq = getPYQData(chapter.id);

  const youtubeUrl = `https://www.youtube.com/results?search_query=CBSE+Class+${chapter.classLevel}+${chapter.subject}+${encodeURIComponent(chapter.title)}+NCERT`;
  const ncertExemplarUrl = chapter.ncertExemplarUrl || `https://ncert.nic.in/exemplar-problems.php`;
  const chapterNotesUrl = `/cbse-notes/${chapter.classLevel}/${slugify(chapter.subject)}/${chapterNotesSlug(chapter)}`;

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <AnalyticsTracker eventName="chapter_view" chapterId={chapter.id} />
      {/* Chapter Header */}
      <div className={clsx('bg-gradient-to-br text-white px-4 py-8', style.header)}>
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/70 text-xs mb-4">
            <Link href="/chapters" className="hover:text-white transition-colors">
              Chapters
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/80">{chapter.subject}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white truncate max-w-[180px]">{chapter.title}</span>
          </div>

          <Link
            href="/chapters"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-sm mb-5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chapters
          </Link>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
              <SubjectIcon className="w-3.5 h-3.5" />
              {chapter.subject}
            </span>
            <span className="bg-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
              Chapter {chapter.chapterNumber}
            </span>
            <span className="bg-amber-400/30 text-amber-100 text-xs font-semibold px-3 py-1 rounded-full">
              {chapter.marks} Marks
            </span>
            <span className="bg-white/10 text-white/80 text-xs font-medium px-3 py-1 rounded-full">
              Class {chapter.classLevel}
            </span>
          </div>

          <h1 className="font-fraunces text-2xl sm:text-3xl font-bold leading-tight mb-2">
            {chapter.title}
          </h1>
          <p className="text-white/80 text-sm max-w-2xl leading-relaxed mb-5">
            {chapter.description}
          </p>

          {/* Exam Relevance Tags */}
          {chapter.examRelevance && chapter.examRelevance.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {chapter.examRelevance.map((tag) => (
                <span key={tag} className="flex items-center gap-1 bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/20">
                  <Target className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <TextToSpeechButton textToRead={`Chapter ${chapter.chapterNumber}, ${chapter.title}. The key topics are: ${chapter.topics.join('. ')}`} />
            <BookmarkButton chapterId={chapter.id} />
            <StudiedButton chapterId={chapter.id} />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* LEFT — Study Material (3/5) */}
          <div className="lg:col-span-3 space-y-5">
            {/* Key Topics */}
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-saffron-500" />
                Key Topics to Study
              </h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {chapter.topics.map((topic, i) => (
                  <div key={topic} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-saffron-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <span className="text-sm text-[#4A4A6A] leading-snug">{topic}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Exam Relevance Detail */}
            {chapter.examRelevance && chapter.examRelevance.length > 0 && (
              <div className={clsx('rounded-2xl border p-5', style.accentBg)}>
                <h2 className="font-fraunces text-base font-bold text-navy-700 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-saffron-500" />
                  Exam Relevance
                </h2>
                <div className="flex flex-wrap gap-3">
                  {chapter.examRelevance.map((tag) => (
                    <div key={tag} className={clsx('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium', RELEVANCE_STYLES[tag] ?? 'bg-gray-50 text-gray-700 border-gray-200')}>
                      <CheckCircle2 className="w-4 h-4" />
                      <div>
                        <div className="font-semibold">{tag}</div>
                        <div className="text-xs opacity-75">{RELEVANCE_DESC[tag]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ChapterNotes chapterId={chapter.id} />

            {/* ── PYQ Analysis ──────────────────────────────────── */}
            {(() => {
              const pyq = chapterPyq;
              const freq = getFrequencyLabel(chapter.id);
              if (!pyq) return null;
              const recentYears = pyq.yearsAsked.filter(y => y >= 2019).sort((a,b) => b-a);
              const olderYears = pyq.yearsAsked.filter(y => y < 2019).sort((a,b) => b-a);
              const allYears = [...pyq.yearsAsked].sort((a, b) => b - a);
              const oldestKnownYear = allYears[allYears.length - 1];
              const latestKnownYear = allYears[0];
              const archivedPaperRange = '2009-2025';
              const archiveYears = Array.from({ length: 2025 - 2009 + 1 }, (_, index) => 2025 - index);
              return (
                <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-fraunces text-lg font-bold text-navy-700 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-saffron-500" />
                      PYQ Analysis
                    </h2>
                    {freq && (
                      <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full border', freq.color)}>
                        {freq.label}
                      </span>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-indigo-700">{pyq.yearsAsked.length}</div>
                      <div className="text-xs text-indigo-500 mt-0.5">Years asked</div>
                    </div>
                    <div className="bg-saffron-50 border border-saffron-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-saffron-600">~{pyq.avgMarks}</div>
                      <div className="text-xs text-saffron-500 mt-0.5">Avg marks</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-700">
                        {oldestKnownYear}-{latestKnownYear}
                      </div>
                      <div className="text-xs text-emerald-500 mt-0.5">Known range</div>
                    </div>
                  </div>

                  {/* Year dots — recent */}
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-[#4A4A6A] mb-2">Paper archive timeline (2009-2025)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {archiveYears.map((yr) => {
                        const isAskedYear = pyq.yearsAsked.includes(yr);
                        return (
                          <span
                            key={yr}
                            className={clsx(
                              'text-xs px-2 py-0.5 rounded-md border',
                              isAskedYear
                                ? 'font-bold bg-indigo-600 text-white border-indigo-600'
                                : 'font-medium bg-gray-50 text-gray-500 border-gray-200'
                            )}
                          >
                            {yr}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[11px] text-[#8A8AAA]">
                      Filled years mean this chapter is tagged as asked in PYQ analysis.
                    </div>
                    <div className="mt-1 text-[11px] text-[#8A8AAA]">
                      Showing all known PYQ years for this chapter:
                      {olderYears.length === 0
                        ? ' no confirmed pre-2019 records in current chapter map.'
                        : ` includes ${olderYears.length} pre-2019 year(s).`}
                    </div>
                    <div className="mt-1 text-[11px] text-[#8A8AAA]">
                      Full paper archive on VidyaPath spans {archivedPaperRange}. 2026+ papers are not released yet.
                    </div>
                    <div className="mt-1 text-[11px] text-[#8A8AAA]">
                      Recent asked years: {recentYears.length > 0 ? recentYears.join(', ') : 'none in current map'}.
                    </div>
                  </div>

                  {/* Important PYQ topics */}
                  {pyq.importantTopics.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-[#4A4A6A] mb-2">Most frequently asked topics</div>
                      <div className="space-y-1">
                        {pyq.importantTopics.slice(0, 4).map((topic, i) => (
                          <div key={topic} className="flex items-center gap-2 text-sm text-[#4A4A6A]">
                            <div className="w-5 h-5 rounded bg-saffron-100 text-saffron-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {i + 1}
                            </div>
                            {topic}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Link
                    href={`/papers?class=${chapter.classLevel}&subject=${chapter.subject}`}
                    className="mt-4 flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Solve {chapter.subject} board papers
                  </Link>
                </div>
              );
            })()}

            {/* Formulas & Mermaid */}
            {chapter.formulas && <FormulaCard formulas={chapter.formulas} />}
            {chapter.mermaidDiagram && <MermaidRenderer chart={chapter.mermaidDiagram} title="Process Workflow" />}

            {/* Native Quizzes & Flashcards */}
            {chapter.flashcards && (
              <FlashcardDeck
                chapterId={chapter.id}
                flashcards={chapter.flashcards}
                subject={chapter.subject}
                chapterTitle={chapter.title}
              />
            )}
            {chapter.quizzes && <QuizEngine chapterId={chapter.id} quizzes={chapter.quizzes} subject={chapter.subject} chapterTitle={chapter.title} />}

            {/* Inline PDF Viewer */}
            <InlinePDFViewer pdfUrl={chapter.ncertPdfUrl} />

            {/* Study Resources */}
            <div className="bg-white rounded-2xl border border-[#E8E4DC] shadow-sm p-5">
              <h2 className="font-fraunces text-lg font-bold text-navy-700 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-saffron-500" />
                Additional Resources
              </h2>
              <div className="space-y-3">

                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 border border-red-100 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Play className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-navy-700">YouTube Video Lectures</div>
                      <div className="text-xs text-[#4A4A6A]">Physics Wallah, Khan Academy & more</div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-red-500 group-hover:translate-x-0.5 transition-transform" />
                </a>

                <a
                  href={ncertExemplarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-navy-700">NCERT Exemplar Problems</div>
                      <div className="text-xs text-[#4A4A6A]">Higher-order thinking problems - Free</div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
                </a>

                <Link
                  href={chapterNotesUrl}
                  className="flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-navy-700">Chapter Notes (SEO)</div>
                      <div className="text-xs text-[#4A4A6A]">Shareable notes URL for quick revision</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>

            <TeacherChapterPanel
              chapterId={chapter.id}
              classLevel={chapter.classLevel === 10 || chapter.classLevel === 12 ? chapter.classLevel : undefined}
              subject={chapter.subject}
              section={section || undefined}
              defaultQuizUrl={chapter.googleFormUrl}
            />

            <ImageQuestionSolver
              chapterTitle={chapter.title}
              classLevel={chapter.classLevel}
              subject={chapter.subject}
            />

            {/* Prev / Next Navigation */}
            <div className="grid grid-cols-2 gap-3">
              {prev ? (
                <Link
                  href={`/chapters/${prev.id}`}
                  className="group flex items-start gap-3 p-4 bg-white rounded-2xl border border-[#E8E4DC] hover:border-saffron-200 hover:shadow-sm transition-all"
                >
                  <ArrowLeft className="w-4 h-4 text-[#8A8AAA] group-hover:text-saffron-500 mt-0.5 flex-shrink-0 transition-colors" />
                  <div className="min-w-0">
                    <div className="text-xs text-[#8A8AAA] font-medium mb-0.5">Previous</div>
                    <div className="text-sm font-semibold text-navy-700 group-hover:text-saffron-600 leading-snug line-clamp-2 transition-colors">
                      {prev.title}
                    </div>
                    <div className="text-xs text-[#8A8AAA] mt-0.5">{prev.subject} - Class {prev.classLevel}</div>
                  </div>
                </Link>
              ) : (
                <div />
              )}

              {next ? (
                <Link
                  href={`/chapters/${next.id}`}
                  className="group flex items-start gap-3 p-4 bg-white rounded-2xl border border-[#E8E4DC] hover:border-saffron-200 hover:shadow-sm transition-all text-right justify-end"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-[#8A8AAA] font-medium mb-0.5">Next</div>
                    <div className="text-sm font-semibold text-navy-700 group-hover:text-saffron-600 leading-snug line-clamp-2 transition-colors">
                      {next.title}
                    </div>
                    <div className="text-xs text-[#8A8AAA] mt-0.5">{next.subject} - Class {next.classLevel}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#8A8AAA] group-hover:text-saffron-500 mt-0.5 flex-shrink-0 transition-colors" />
                </Link>
              ) : (
                <div />
              )}
            </div>
          </div>

          {/* RIGHT — AI Tutor (2/5) — sticky on desktop */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-5">
              <PomodoroTimer
                chapterTitle={chapter.title}
                pyqStats={chapterPyq ? {
                  avgMarks: chapterPyq.avgMarks,
                  importantTopics: chapterPyq.importantTopics,
                  yearsAsked: chapterPyq.yearsAsked,
                } : null}
              />

              <LearningProfileInsights
                chapterId={chapter.id}
                chapterTitle={chapter.title}
                pyqAvgMarks={chapterPyq?.avgMarks ?? 0}
                flashcardCount={chapter.flashcards?.length ?? 0}
              />

              <ChapterIntelligenceHub
                chapterId={chapter.id}
                chapterTitle={chapter.title}
                subject={chapter.subject}
                classLevel={chapter.classLevel}
                chapterTopics={chapter.topics}
                flashcardCount={chapter.flashcards?.length ?? 0}
              />
              
              <div>
                <AIChatBox
                  chapterId={chapter.id}
                  chapterTitle={chapter.title}
                  chapterTopics={chapter.topics}
                  classLevel={chapter.classLevel}
                  subject={chapter.subject}
                />
                <p className="text-xs text-[#8A8AAA] text-center mt-2">
                  VidyaAI is trained on NCERT curriculum only
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

