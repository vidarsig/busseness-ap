import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ViewerPhoto {
  dataUrl: string;
  caption?: string;
}

interface Props {
  photos: ViewerPhoto[];
  startIndex?: number;
  onClose: () => void;
  altLabel?: string;
}

// A full-screen photo viewer used everywhere photos are attached (Færslur,
// Reikningar, Verkbókhald). Flip through them one by one with the arrows (or the
// ← → keys); a single photo just shows on its own with no arrows.
export default function PhotoViewer({ photos, startIndex = 0, onClose, altLabel }: Props) {
  const count = photos.length;
  const [i, setI] = useState(startIndex);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setI(p => (p - 1 + count) % count);
      else if (e.key === 'ArrowRight') setI(p => (p + 1) % count);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [count, onClose]);

  if (count === 0) return null;
  const photo = photos[Math.min(i, count - 1)];

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}>
      <button onClick={onClose} aria-label="Close"
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white/90 hover:bg-black/70 transition">
        <X className="w-5 h-5" />
      </button>

      {count > 1 && (
        <button onClick={e => { e.stopPropagation(); setI(p => (p - 1 + count) % count); }} aria-label="Previous"
          className="absolute left-2 md:left-6 p-2 rounded-full bg-black/50 text-white/90 hover:bg-black/70 transition">
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      <div className="max-w-3xl w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
        <img src={photo.dataUrl} alt={photo.caption || altLabel || ''}
          className="w-full rounded-xl shadow-2xl max-h-[82vh] object-contain" />
        {(photo.caption || count > 1) && (
          <div className="text-center mt-3 text-sm text-white/80">
            {photo.caption && <span>{photo.caption}</span>}
            {count > 1 && <span className="ml-2 text-white/50">{i + 1} / {count}</span>}
          </div>
        )}
      </div>

      {count > 1 && (
        <button onClick={e => { e.stopPropagation(); setI(p => (p + 1) % count); }} aria-label="Next"
          className="absolute right-2 md:right-6 p-2 rounded-full bg-black/50 text-white/90 hover:bg-black/70 transition">
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
    </div>
  );
}
