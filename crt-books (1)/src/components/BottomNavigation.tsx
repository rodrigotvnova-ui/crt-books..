import React, { useEffect, useState } from 'react';
import { BookOpen, Compass, Home, Route, User } from 'lucide-react';
import { ActiveTab } from '../types/models';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isTextInputElement = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'textarea') return true;
      if (tag === 'input') {
        const type = (
          (el as HTMLInputElement).type || 'text'
        ).toLowerCase();
        return ['text', 'search', 'email', 'password', 'tel', 'url', 'number'].includes(
          type
        );
      }
      return (el as HTMLElement).isContentEditable === true;
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (window.innerWidth < 768 && isTextInputElement(e.target as Element)) {
        setIsVirtualKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        if (!isTextInputElement(document.activeElement)) {
          setIsVirtualKeyboardOpen(false);
        }
      }, 100);
    };

    const viewport = window.visualViewport;
    const handleViewportResize = () => {
      if (!viewport || window.innerWidth >= 768) {
        setIsVirtualKeyboardOpen(false);
        return;
      }
      const heightRatio = viewport.height / window.innerHeight;
      if (heightRatio < 0.76 && isTextInputElement(document.activeElement)) {
        setIsVirtualKeyboardOpen(true);
      } else if (heightRatio >= 0.85) {
        setIsVirtualKeyboardOpen(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    viewport?.addEventListener('resize', handleViewportResize);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      viewport?.removeEventListener('resize', handleViewportResize);
    };
  }, []);

  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    isCenterHighlight?: boolean;
  }[] = [
    {
      id: 'home',
      label: 'Início',
      icon: <Home className="w-5 h-5" />,
    },
    {
      id: 'explore',
      label: 'Explorar',
      icon: <Compass className="w-5 h-5" />,
    },
    {
      id: 'trail',
      label: 'Minha Trilha',
      icon: <Route className="w-5 h-5" />,
      isCenterHighlight: true,
    },
    {
      id: 'library',
      label: 'Biblioteca',
      icon: <BookOpen className="w-5 h-5" />,
    },
    {
      id: 'profile',
      label: 'Perfil',
      icon: <User className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className={`fixed bottom-0 inset-x-0 z-40 bg-[#07090E]/95 backdrop-blur-xl border-t border-white/[0.08] safe-bottom transition-transform duration-200 ${
        isVirtualKeyboardOpen
          ? 'translate-y-full pointer-events-none opacity-0 md:translate-y-0 md:pointer-events-auto md:opacity-100'
          : 'translate-y-0 opacity-100'
      }`}
    >
      <div className="max-w-xl mx-auto px-1.5 sm:px-2 h-16 grid grid-cols-5 items-center">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;

          if (item.isCenterHighlight) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className="group relative flex flex-col items-center justify-center min-h-[48px] cursor-pointer focus:outline-none"
              >
                <div
                  className={`w-11 h-11 -mt-3 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.45)] scale-105'
                      : 'bg-gradient-to-br from-cyan-500/25 to-sky-500/15 text-cyan-300 border border-cyan-400/35 group-hover:border-cyan-400/60 group-hover:text-cyan-200'
                  }`}
                >
                  {item.icon}
                </div>
                <span
                  className={`text-[10px] font-semibold tracking-tight mt-1 whitespace-nowrap truncate max-w-full px-0.5 transition-colors ${
                    isActive
                      ? 'text-cyan-400'
                      : 'text-cyan-300/85 group-hover:text-cyan-200'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className="group relative flex flex-col items-center justify-center min-h-[48px] py-1 cursor-pointer focus:outline-none"
            >
              <div
                className={`transition-colors duration-200 ${
                  isActive
                    ? 'text-cyan-400'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {item.icon}
              </div>
              <span
                className={`text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap truncate max-w-full px-0.5 transition-colors ${
                  isActive
                    ? 'text-cyan-400 font-semibold'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-cyan-400" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
