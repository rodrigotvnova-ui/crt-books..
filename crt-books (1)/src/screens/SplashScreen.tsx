import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const step1 = setTimeout(() => setProgress(65), 350);
    const step2 = setTimeout(() => setProgress(100), 1400);
    const finish = setTimeout(() => {
      onComplete();
    }, 2300);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(finish);
    };
  }, [onComplete]);

  return (
    <div className="min-h-screen w-full bg-[#07090E] flex flex-col items-center justify-between px-6 py-12 relative overflow-hidden select-none">
      {/* Subtle atmospheric radial light */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] sm:w-[480px] sm:h-[480px] rounded-full bg-cyan-500/[0.08] blur-[110px] animate-pulse-subtle" />

      <div className="h-8" />

      {/* Center Brand Lockup */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-md mx-auto animate-in fade-in zoom-in-95 duration-700">
        {/* Minimalist Geometric Emblem */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#121C2E] to-[#0A0E17] border border-cyan-400/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,211,238,0.18)]">
          <div className="w-5 h-5 rounded-full border-2 border-cyan-400 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
          </div>
        </div>

        <h1 className="text-3xl sm:text-5xl font-display font-extrabold tracking-[0.18em] text-white">
          CRT BOOKS
        </h1>

        <p className="mt-3 text-sm sm:text-base font-medium tracking-[0.16em] text-cyan-300/90 uppercase">
          Leia. Ouça. Evolua.
        </p>

        <p className="mt-6 text-xs sm:text-sm text-slate-400 max-w-xs leading-relaxed">
          O conhecimento certo para o momento certo da sua evolução.
        </p>

        {/* Smooth loading progress bar */}
        <div className="w-48 h-1 bg-white/[0.07] rounded-full overflow-hidden mt-8">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-sky-300 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Immediate skip/continue affordance */}
      <div className="relative z-10">
        <button
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <span>Avançar</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
