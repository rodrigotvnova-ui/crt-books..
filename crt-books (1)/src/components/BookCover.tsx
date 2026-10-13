import React, { useState } from 'react';
import { Work } from '../types/models';

interface BookCoverProps {
  work: Work;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const BookCover: React.FC<BookCoverProps> = ({
  work,
  size = 'md',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-16 h-24 rounded-xl',
    md: 'w-32 h-44 rounded-2xl',
    lg: 'w-40 h-56 rounded-2xl',
    xl: 'w-48 h-68 sm:w-56 sm:h-76 rounded-2xl',
  }[size];

  const showGeneratedImage = Boolean(work.cover) && !imgError;
  const isRealExtractedCover =
    showGeneratedImage && Boolean(work.cover?.includes('/book-covers/'));

  return (
    <div
      className={`relative overflow-hidden select-none shrink-0 border border-white/12 shadow-[0_18px_36px_-15px_rgba(0,0,0,0.85)] group ${sizeClasses} ${className}`}
      style={{
        background: `linear-gradient(155deg, ${work.coverTheme.primaryColor} 0%, ${work.coverTheme.secondaryColor} 100%)`,
      }}
    >
      {/* Subtle book spine crease on left edge */}
      <div className="absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-white/15 via-black/30 to-transparent z-20 pointer-events-none" />

      {showGeneratedImage ? (
        <img
          src={work.cover}
          alt={`Capa da obra ${work.title} por ${work.author}`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        /* Bespoke Geometric Vector Artwork Fallback */
        <div className="absolute inset-0 flex items-center justify-center opacity-45 pointer-events-none">
          <svg
            viewBox="0 0 200 280"
            className="w-full h-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="100"
              cy="125"
              r="64"
              stroke={work.coverTheme.accentHex}
              strokeWidth="1"
              strokeOpacity="0.45"
            />
            <circle
              cx="100"
              cy="125"
              r="42"
              stroke={work.coverTheme.accentHex}
              strokeWidth="1.2"
              strokeDasharray="4 4"
              strokeOpacity="0.6"
            />
            <path
              d="M40 220 L160 65"
              stroke={work.coverTheme.accentHex}
              strokeWidth="1.5"
              strokeOpacity="0.7"
            />
            <circle
              cx="100"
              cy="125"
              r="5"
              fill={work.coverTheme.accentHex}
            />
          </svg>
        </div>
      )}

      {!isRealExtractedCover && (
        <>
          {/* Measured contrast scrim for crisp typography legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070B] via-[#05070B]/45 to-black/25 z-10 pointer-events-none" />

          {/* Editorial Cover Overlay Content */}
          <div className="relative z-20 h-full w-full flex flex-col justify-between p-3 sm:p-3.5">
            <div className="flex items-center justify-between">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: work.coverTheme.accentHex }}
              />
              <span className="text-[9px] font-mono-tabular tracking-widest text-slate-300/80 uppercase">
                CRT
              </span>
            </div>

            <div className="space-y-1">
              <p
                className={`font-display font-bold text-white leading-tight tracking-tight line-clamp-3 ${
                  size === 'sm'
                    ? 'text-[10px]'
                    : size === 'md'
                    ? 'text-xs'
                    : size === 'lg'
                    ? 'text-sm'
                    : 'text-base sm:text-lg'
                }`}
              >
                {work.title}
              </p>
              {size !== 'sm' && (
                <p className="text-[11px] text-slate-300/90 truncate font-medium">
                  {work.author}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
