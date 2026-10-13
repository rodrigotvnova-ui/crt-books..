import React from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  title: string;
  subtitle?: string;
  type?: 'info' | 'success';
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md pointer-events-auto animate-in fade-in slide-in-from-top-3 duration-200">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-[#111827]/95 backdrop-blur-xl border border-cyan-400/30 shadow-[0_20px_50px_rgba(0,0,0,0.75)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Info className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-white leading-snug">
              {toast.title}
            </p>
            {toast.subtitle && (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {toast.subtitle}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar aviso"
          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
