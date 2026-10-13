import React from 'react';
import { ContentFormat } from '../types/models';

interface FormatBadgeProps {
  formats: ContentFormat[];
  variant?: 'inline' | 'subtle';
  className?: string;
}

/**
 * Renderiza os formatos disponíveis de uma única OBRA (WORK)
 * Ex: 📖 Ebook · 🎧 Audiobook
 * Seguindo Zero-Pill Discipline (texto limpo com separador tipográfico)
 */
export const FormatBadge: React.FC<FormatBadgeProps> = ({
  formats,
  variant = 'inline',
  className = '',
}) => {
  const hasEbook = formats.includes('ebook');
  const hasAudio = formats.includes('audio');

  return (
    <div
      className={`inline-flex items-center gap-2 text-xs font-medium tracking-tight ${
        variant === 'inline' ? 'text-slate-300' : 'text-slate-400'
      } ${className}`}
    >
      {hasEbook && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden="true">📖</span>
          <span>Ebook</span>
        </span>
      )}
      {hasEbook && hasAudio && (
        <span aria-hidden="true" className="text-slate-600">
          ·
        </span>
      )}
      {hasAudio && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden="true">🎧</span>
          <span>Audiobook</span>
        </span>
      )}
    </div>
  );
};
