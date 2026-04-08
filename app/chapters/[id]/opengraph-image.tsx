import { ImageResponse } from 'next/og';
import { getChapterById } from '@/lib/data';

export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image({ params }: { params: { id: string } }) {
  const chapter = getChapterById(params.id);
  const title = chapter?.title ?? 'CBSE Chapter';
  const meta = chapter
    ? `Class ${chapter.classLevel} • ${chapter.subject} • ${chapter.marks} Marks`
    : 'VidyaPath';
  const topics = chapter?.topics.slice(0, 2).join(', ') ?? 'NCERT-first exam preparation';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 56,
          background: 'linear-gradient(135deg, #1a2744 0%, #e8511a 100%)',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 36, fontWeight: 700 }}>
          VidyaPath
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.08, maxWidth: 1000 }}>{title}</div>
          <div style={{ fontSize: 28, opacity: 0.95 }}>{meta}</div>
          <div style={{ fontSize: 22, opacity: 0.9 }}>Topics: {topics}</div>
        </div>

        <div style={{ fontSize: 24, opacity: 0.92 }}>100% Free • No Login • AI + PYQ Intelligence</div>
      </div>
    ),
    { ...size }
  );
}
