import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Headphones,
  Layers,
} from 'lucide-react';
import {
  dailyTimeToMinutes,
  ONBOARDING_FORMAT_OPTIONS,
  ONBOARDING_INTERESTS,
  ONBOARDING_TIME_OPTIONS,
} from '../data/mockData';
import { OnboardingPreferences } from '../types/models';

interface OnboardingScreenProps {
  initialPreferences: OnboardingPreferences;
  onStep1Save?: (interests: string[]) => Promise<void> | void;
  onStep2Save?: (dailyTime: string) => Promise<void> | void;
  onComplete: (preferences: OnboardingPreferences) => Promise<void> | void;
  onNotify: (title: string, subtitle?: string) => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  initialPreferences,
  onStep1Save,
  onStep2Save,
  onComplete,
  onNotify,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [interests, setInterests] = useState<string[]>(
    initialPreferences.interests.length > 0
      ? initialPreferences.interests
      : ['Disciplina e foco']
  );
  const [dailyTime, setDailyTime] = useState<string>(
    initialPreferences.dailyTime || '20 minutos'
  );
  const [preferredFormat, setPreferredFormat] = useState<
    'Lendo' | 'Ouvindo' | 'Os dois'
  >(initialPreferences.preferredFormat || 'Os dois');

  const toggleInterest = (item: string) => {
    if (interests.includes(item)) {
      setInterests(interests.filter((i) => i !== item));
      return;
    }
    if (interests.length >= 3) {
      onNotify(
        'Limite de 3 objetivos atingido',
        'Desmarque uma opção caso queira trocar sua prioridade.'
      );
      return;
    }
    setInterests([...interests, item]);
  };

  const handleNext = async () => {
    if (saving) return;

    if (step === 1) {
      if (interests.length === 0) {
        onNotify(
          'Escolha pelo menos 1 área',
          'Selecione até 3 objetivos para personalizar.'
        );
        return;
      }
      setSaving(true);
      try {
        if (onStep1Save) {
          await onStep1Save(interests);
        }
        setStep(2);
      } finally {
        setSaving(false);
      }
    } else if (step === 2) {
      setSaving(true);
      try {
        if (onStep2Save) {
          await onStep2Save(dailyTime);
        }
        setStep(3);
      } finally {
        setSaving(false);
      }
    } else {
      setSaving(true);
      try {
        await onComplete({
          interests,
          dailyTime,
          dailyMinutes: dailyTimeToMinutes(dailyTime),
          preferredFormat,
          onboardingCompleted: true,
          completedAt: new Date().toISOString(),
        });
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090E] text-white flex flex-col justify-between px-4 sm:px-6 py-6 sm:py-10 safe-top safe-bottom relative overflow-x-hidden">
      {/* Subtle Ambient Light */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[280px] rounded-full bg-cyan-500/[0.07] blur-[100px]" />

      {/* Top Header & Progress Indicator */}
      <div className="relative z-10 max-w-2xl w-full mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}
                aria-label="Voltar etapa"
                className="min-w-[40px] min-h-[40px] rounded-xl bg-[#0E131F] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-display font-bold text-sm tracking-[0.14em] text-white">
              CRT BOOKS
            </span>
          </div>

          <span className="text-xs font-mono-tabular font-semibold tracking-wider text-cyan-400">
            ETAPA {step} DE 3
          </span>
        </div>

        {/* 3-Step Segmented Progress Bar */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx <= step
                  ? 'bg-gradient-to-r from-cyan-400 to-sky-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                  : 'bg-white/[0.08]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Step Content */}
      <div className="relative z-10 max-w-2xl w-full mx-auto my-auto py-8">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                O que você quer desenvolver?
              </h1>
              <div className="flex items-center justify-between text-xs sm:text-sm text-slate-400">
                <span>Escolha até 3</span>
                <span className="font-mono-tabular text-cyan-400 font-semibold">
                  {interests.length}/3 selecionados
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ONBOARDING_INTERESTS.map((option) => {
                const isSelected = interests.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleInterest(option)}
                    className={`group text-left min-h-[64px] px-5 py-4 rounded-2xl border transition-all duration-200 active:scale-[0.99] flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_25px_rgba(34,211,238,0.14)]'
                        : 'bg-[#0E131F]/85 hover:bg-[#131B2E] border-white/[0.08] text-slate-200 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm sm:text-base font-display font-semibold">
                      {option}
                    </span>
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                        isSelected
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-white/[0.05] border border-white/10 text-transparent group-hover:border-white/25'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                Quanto tempo você tem por dia?
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                A constância diária supera o excesso ocasional.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {ONBOARDING_TIME_OPTIONS.map((item) => {
                const isSelected = dailyTime === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDailyTime(item.value)}
                    className={`text-left min-h-[92px] p-5 rounded-2xl border transition-all duration-200 active:scale-[0.99] flex flex-col justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_25px_rgba(34,211,238,0.15)]'
                        : 'bg-[#0E131F]/85 hover:bg-[#131B2E] border-white/[0.08] text-slate-200 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="inline-flex items-center gap-2">
                        <Clock
                          className={`w-4 h-4 ${
                            isSelected ? 'text-cyan-400' : 'text-slate-400'
                          }`}
                        />
                        <span className="text-base sm:text-lg font-display font-bold">
                          {item.label}
                        </span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                            : 'border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {item.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                Como você prefere aprender?
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Adaptamos a apresentação das obras ao seu estilo cognitivo.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {ONBOARDING_FORMAT_OPTIONS.map((item) => {
                const isSelected = preferredFormat === item.value;
                const getIcon = () => {
                  if (item.value === 'Lendo')
                    return <BookOpen className="w-5 h-5" />;
                  if (item.value === 'Ouvindo')
                    return <Headphones className="w-5 h-5" />;
                  return <Layers className="w-5 h-5" />;
                };

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPreferredFormat(item.value)}
                    className={`text-left min-h-[84px] p-5 rounded-2xl border transition-all duration-200 active:scale-[0.99] flex items-center justify-between gap-4 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_25px_rgba(34,211,238,0.15)]'
                        : 'bg-[#0E131F]/85 hover:bg-[#131B2E] border-white/[0.08] text-slate-200 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-white/[0.05] text-cyan-400'
                        }`}
                      >
                        {getIcon()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-display font-bold text-white">
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                          : 'border-white/20'
                      }`}
                    >
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Area */}
      <div className="relative z-10 max-w-2xl w-full mx-auto pt-4 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="w-full min-h-[52px] rounded-2xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-display font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all active:scale-[0.99] cursor-pointer"
        >
          <span>
            {saving
              ? 'SALVANDO...'
              : step < 3
              ? 'CONTINUAR'
              : 'CRIAR MINHA EXPERIÊNCIA'}
          </span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
