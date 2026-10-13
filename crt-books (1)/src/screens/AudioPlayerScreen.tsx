import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headphones,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { BookCover } from '../components/BookCover';
import {
  fetchAudioProgressForWork,
  saveAudioListeningProgress,
} from '../services/database';
import {
  getSupabaseAuthHeaders,
  syncServerAuthSessionCookie,
} from '../services/supabase';
import { OfflineTopBanner } from '../components/OfflineExperience';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { AuthenticatedUser, Work } from '../types/models';

const PLAYBACK_RATES = [0.85, 0.9, 0.95, 1, 1.25, 1.5, 2] as const;
const PERIODIC_SAVE_INTERVAL_SEC = 5;

type PitchPreservingAudioElement = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

function applyAudioPlaybackSettings(
  audio: HTMLAudioElement | null,
  rate: number
): void {
  if (!audio) return;
  const pitchAudio = audio as PitchPreservingAudioElement;
  if ('preservesPitch' in pitchAudio) {
    pitchAudio.preservesPitch = true;
  }
  if ('mozPreservesPitch' in pitchAudio) {
    pitchAudio.mozPreservesPitch = true;
  }
  if ('webkitPreservesPitch' in pitchAudio) {
    pitchAudio.webkitPreservesPitch = true;
  }
  audio.defaultPlaybackRate = 1;
  audio.playbackRate = rate;
}

function formatPlaybackRateLabel(rate: number): string {
  if (rate === 1 || rate === 2) {
    return `${rate.toFixed(1)}x`;
  }
  return `${rate}x`;
}

interface AudioErrorDiagnostic {
  mediaErrorCode: number | null;
  mediaErrorLabel: string;
  mediaErrorMessage: string;
  httpStatus: number | null;
  contentType: string | null;
  contentRange: string | null;
  contentLength: string | null;
}

function getMediaErrorLabel(code?: number | null): string {
  switch (code) {
    case 1:
      return 'MEDIA_ERR_ABORTED (1)';
    case 2:
      return 'MEDIA_ERR_NETWORK (2)';
    case 3:
      return 'MEDIA_ERR_DECODE (3)';
    case 4:
      return 'MEDIA_ERR_SRC_NOT_SUPPORTED (4)';
    default:
      return 'UNKNOWN_MEDIA_ERROR';
  }
}

export function formatAudioTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const clamped = Math.floor(totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

interface AudioPlayerScreenProps {
  work: Work | null;
  user?: AuthenticatedUser | null;
  isLoadingWork?: boolean;
  onBack: () => void;
  onProgressUpdated?: (
    workId: string,
    currentSeconds: number,
    durationSeconds: number,
    progressPercent: number,
    completed: boolean
  ) => void;
}

export const AudioPlayerScreen: React.FC<AudioPlayerScreenProps> = ({
  work,
  user = null,
  isLoadingWork = false,
  onBack,
  onProgressUpdated,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioAsset = work?.assets.find(
    (a) =>
      a.format === 'audio' ||
      a.mimeType === 'audio/mpeg' ||
      a.mimeType === 'audio/mp4' ||
      a.mimeType === 'audio/x-m4a'
  );
  const assetId = audioAsset?.id || null;
  const fallbackDuration =
    audioAsset?.durationSeconds && audioAsset.durationSeconds > 0
      ? audioAsset.durationSeconds
      : 0;

  const initialWorkSavedTime =
    work &&
    (work.progressType === 'listening' ||
      !work.availableFormats.includes('ebook')) &&
    typeof work.position === 'number' &&
    work.position > 0
      ? Math.floor(work.position)
      : 0;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(initialWorkSavedTime);
  const [duration, setDuration] = useState<number>(fallbackDuration);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorDiagnostic, setErrorDiagnostic] =
    useState<AudioErrorDiagnostic | null>(null);
  const [streamReloadKey, setStreamReloadKey] = useState<number>(0);
  const [authCookieReady, setAuthCookieReady] = useState<boolean>(false);
  const [restoredFromTime, setRestoredFromTime] = useState<number | null>(
    initialWorkSavedTime > 0 ? initialWorkSavedTime : null
  );
  const [lastSavedAtTime, setLastSavedAtTime] = useState<number | null>(
    initialWorkSavedTime > 0 ? initialWorkSavedTime : null
  );
  const { isOnline, checkingConnection, verifyConnectionNow } =
    useNetworkStatus();

  // Refs para controle de restauração e salvamento automático sem re-renderizações desnecessárias
  const pendingRestoreTimeRef = useRef<number | null>(
    initialWorkSavedTime > 0 ? initialWorkSavedTime : null
  );
  const hasAppliedInitialRestoreRef = useRef<boolean>(false);
  const lastSavedSecondsRef = useRef<number>(initialWorkSavedTime);
  const lastSaveEpochMsRef = useRef<number>(0);
  const seekSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveDuration = duration > 0 ? duration : fallbackDuration;

  const latestStateRef = useRef<{
    work: Work | null;
    user: AuthenticatedUser | null;
    assetId: string | null;
    currentTime: number;
    duration: number;
  }>({
    work,
    user,
    assetId,
    currentTime,
    duration: effectiveDuration,
  });

  useEffect(() => {
    latestStateRef.current = {
      work,
      user,
      assetId,
      currentTime,
      duration: effectiveDuration,
    };
  }, [work, user, assetId, currentTime, effectiveDuration]);

  // Função centralizada que persiste o ponto exato do audiobook em user_progress e sincroniza o estado global do app
  const persistAudioProgressSnapshot = useCallback(
    async (
      secondsToSave: number,
      durationToSave: number,
      forceCompleted = false
    ) => {
      const snap = latestStateRef.current;
      const currentWork = snap.work;
      const currentUser = snap.user;
      const currentAssetId = snap.assetId;

      if (!currentWork || !currentAssetId) return;

      const safeDuration = Math.max(
        1,
        Math.floor(durationToSave || snap.duration || fallbackDuration || 1)
      );
      const safePosition = Math.min(
        Math.max(0, Math.floor(secondsToSave || 0)),
        safeDuration
      );

      // Evita sobrescrever progresso salvo com 0 ao apenas abrir a tela sem reproduzir
      if (safePosition <= 0 && !forceCompleted) {
        return;
      }

      const completed =
        Boolean(forceCompleted) ||
        (safeDuration > 0 && safePosition >= safeDuration - 5);
      const progressPercent = completed
        ? 100
        : safePosition > 0
        ? Math.min(
            99,
            Math.max(1, Math.round((safePosition / safeDuration) * 100))
          )
        : 0;

      lastSavedSecondsRef.current = safePosition;
      lastSaveEpochMsRef.current = Date.now();
      setLastSavedAtTime(safePosition);

      if (onProgressUpdated) {
        onProgressUpdated(
          currentWork.id,
          safePosition,
          safeDuration,
          progressPercent,
          completed
        );
      }

      if (currentUser) {
        try {
          await saveAudioListeningProgress(
            currentUser,
            currentWork,
            currentAssetId,
            safePosition,
            safeDuration,
            completed
          );
        } catch (err) {
          console.warn(
            '[CRT Audio Player] Aviso ao persistir progresso de áudio:',
            err
          );
        }
      }
    },
    [fallbackDuration, onProgressUpdated]
  );

  const scheduleDebouncedProgressSave = useCallback(
    (targetSeconds: number, targetDuration: number) => {
      if (seekSaveDebounceRef.current) {
        clearTimeout(seekSaveDebounceRef.current);
      }
      seekSaveDebounceRef.current = setTimeout(() => {
        persistAudioProgressSnapshot(targetSeconds, targetDuration, false);
      }, 350);
    },
    [persistAudioProgressSnapshot]
  );

  // Aplica a restauração da posição salva no elemento <audio> quando os metadados estiverem prontos
  const applyPendingRestoreIfReady = useCallback(
    (audioEl: HTMLAudioElement | null, knownDuration: number) => {
      if (!audioEl || hasAppliedInitialRestoreRef.current) return;
      const target = pendingRestoreTimeRef.current;
      if (target === null || target <= 0) {
        hasAppliedInitialRestoreRef.current = true;
        return;
      }

      if (audioEl.readyState >= 1) {
        const clampedTarget =
          knownDuration > 0
            ? Math.min(target, Math.max(0, Math.floor(knownDuration - 2)))
            : target;
        hasAppliedInitialRestoreRef.current = true;
        if (clampedTarget > 0) {
          try {
            audioEl.currentTime = clampedTarget;
            setCurrentTime(clampedTarget);
            setRestoredFromTime(clampedTarget);
            setLastSavedAtTime(clampedTarget);
            lastSavedSecondsRef.current = clampedTarget;
          } catch (err) {
            console.warn(
              '[CRT Audio Player] Aviso ao restaurar posição inicial do áudio:',
              err
            );
          }
        }
      }
    },
    []
  );

  // Sincroniza duração inicial do banco caso metadata ainda não tenha carregado
  useEffect(() => {
    if (fallbackDuration > 0 && duration === 0) {
      setDuration(fallbackDuration);
    }
  }, [fallbackDuration, duration]);

  // Ao abrir ou trocar de obra/asset, consulta o progresso salvo no Supabase e configura restauração
  useEffect(() => {
    if (!work) return;
    let cancelled = false;

    const candidateFromWork =
      (work.progressType === 'listening' ||
        !work.availableFormats.includes('ebook')) &&
      typeof work.position === 'number' &&
      work.position > 0
        ? Math.floor(work.position)
        : 0;

    hasAppliedInitialRestoreRef.current = false;
    pendingRestoreTimeRef.current =
      candidateFromWork > 0 ? candidateFromWork : null;
    lastSavedSecondsRef.current = candidateFromWork;

    setIsPlaying(false);
    setIsBuffering(Boolean(assetId));
    setIsSeeking(false);
    setCurrentTime(candidateFromWork);
    setDuration(fallbackDuration);
    setPlaybackRate(1.0);
    setHasError(!assetId);
    setErrorDiagnostic(null);
    setRestoredFromTime(candidateFromWork > 0 ? candidateFromWork : null);
    setLastSavedAtTime(candidateFromWork > 0 ? candidateFromWork : null);
    setAuthCookieReady(false);

    syncServerAuthSessionCookie()
      .catch(() => false)
      .finally(() => {
        if (!cancelled) {
          setAuthCookieReady(true);
        }
      });

    if (user && work.id) {
      fetchAudioProgressForWork(user, work.id)
        .then((savedProg) => {
          if (cancelled || !savedProg) return;
          const dbPos = Math.max(0, Math.floor(savedProg.position || 0));
          if (dbPos > 0) {
            pendingRestoreTimeRef.current = dbPos;
            lastSavedSecondsRef.current = dbPos;
            setRestoredFromTime(dbPos);
            setLastSavedAtTime(dbPos);

            const audio = audioRef.current;
            if (audio && !hasAppliedInitialRestoreRef.current) {
              if (audio.readyState >= 1) {
                const dur =
                  Number.isFinite(audio.duration) && audio.duration > 0
                    ? audio.duration
                    : fallbackDuration;
                applyPendingRestoreIfReady(audio, dur);
              } else {
                setCurrentTime(dbPos);
              }
            } else if (!audio || audio.paused) {
              setCurrentTime(dbPos);
            }
          }
        })
        .catch(() => {
          // fallback silencioso para candidateFromWork
        });
    }

    return () => {
      cancelled = true;
    };
  }, [work?.id, assetId, fallbackDuration, user?.uid, applyPendingRestoreIfReady]);

  // Pausa e persiste o progresso mais recente ao desmontar a tela ou fechar a aba
  useEffect(() => {
    const handleVisibilityOrUnload = () => {
      const audio = audioRef.current;
      const snap = latestStateRef.current;
      const bestTime = Math.max(
        snap.currentTime,
        audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      );
      if (bestTime > 0 && snap.duration > 0) {
        persistAudioProgressSnapshot(bestTime, snap.duration, false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleVisibilityOrUnload();
      }
    };

    window.addEventListener('beforeunload', handleVisibilityOrUnload);
    window.addEventListener('pagehide', handleVisibilityOrUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleVisibilityOrUnload);
      window.removeEventListener('pagehide', handleVisibilityOrUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (seekSaveDebounceRef.current) {
        clearTimeout(seekSaveDebounceRef.current);
        seekSaveDebounceRef.current = null;
      }

      const audioEl = audioRef.current;
      const snap = latestStateRef.current;
      const finalTime = Math.max(
        snap.currentTime,
        audioEl && Number.isFinite(audioEl.currentTime)
          ? audioEl.currentTime
          : 0
      );

      if (audioEl) {
        audioEl.pause();
      }

      if (finalTime > 0 && snap.duration > 0) {
        persistAudioProgressSnapshot(finalTime, snap.duration, false);
      }
    };
  }, [persistAudioProgressSnapshot]);

  const handleBackClick = useCallback(() => {
    const audio = audioRef.current;
    const snap = latestStateRef.current;
    const finalTime = Math.max(
      snap.currentTime,
      audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    );
    if (audio && !audio.paused) {
      audio.pause();
    }
    if (finalTime > 0 && snap.duration > 0) {
      persistAudioProgressSnapshot(finalTime, snap.duration, false);
    }
    onBack();
  }, [onBack, persistAudioProgressSnapshot]);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let resolvedDuration = fallbackDuration;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      resolvedDuration = audio.duration;
      setDuration(audio.duration);
    } else if (fallbackDuration > 0) {
      setDuration(fallbackDuration);
    }
    applyAudioPlaybackSettings(audio, playbackRate);
    applyPendingRestoreIfReady(audio, resolvedDuration);
    setIsBuffering(false);
    setHasError(false);
    setErrorDiagnostic(null);
  }, [fallbackDuration, playbackRate, applyPendingRestoreIfReady]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const nowSec = audio.currentTime;
    setCurrentTime(nowSec);

    let activeDuration = duration > 0 ? duration : fallbackDuration;
    if (
      Number.isFinite(audio.duration) &&
      audio.duration > 0 &&
      Math.abs(audio.duration - duration) > 1
    ) {
      activeDuration = audio.duration;
      setDuration(audio.duration);
    }

    // Salvamento periódico automático a cada 5 segundos durante a reprodução
    if (
      !audio.paused &&
      nowSec > 0 &&
      Math.abs(nowSec - lastSavedSecondsRef.current) >=
        PERIODIC_SAVE_INTERVAL_SEC &&
      Date.now() - lastSaveEpochMsRef.current >=
        PERIODIC_SAVE_INTERVAL_SEC * 1000
    ) {
      persistAudioProgressSnapshot(nowSec, activeDuration, false);
    }
  }, [duration, fallbackDuration, persistAudioProgressSnapshot]);

  const handlePlayEvent = useCallback(() => {
    applyAudioPlaybackSettings(audioRef.current, playbackRate);
    setIsPlaying(true);
    setHasError(false);
  }, [playbackRate]);

  const handlePauseEvent = useCallback(() => {
    setIsPlaying(false);
    const audio = audioRef.current;
    if (!audio) return;
    const pausedAt = Math.max(0, audio.currentTime || 0);
    const activeDuration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : effectiveDuration;
    if (pausedAt > 0 && activeDuration > 0) {
      persistAudioProgressSnapshot(pausedAt, activeDuration, false);
    }
  }, [effectiveDuration, persistAudioProgressSnapshot]);

  const handleEndedEvent = useCallback(() => {
    setIsPlaying(false);
    const audio = audioRef.current;
    const activeDuration =
      audio && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : effectiveDuration;
    if (activeDuration > 0) {
      setCurrentTime(activeDuration);
      persistAudioProgressSnapshot(activeDuration, activeDuration, true);
    }
  }, [effectiveDuration, persistAudioProgressSnapshot]);

  const handleSeekingEvent = useCallback(() => {
    setIsSeeking(true);
    setIsBuffering(true);
  }, []);

  const handleSeekedEvent = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      const seekedTime = audio.currentTime;
      setCurrentTime(seekedTime);
      const activeDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : effectiveDuration;
      if (seekedTime > 0 && activeDuration > 0) {
        scheduleDebouncedProgressSave(seekedTime, activeDuration);
      }
    }
    setIsSeeking(false);
    setIsBuffering(false);
  }, [effectiveDuration, scheduleDebouncedProgressSave]);

  const handleWaitingEvent = useCallback(() => {
    setIsBuffering(true);
  }, []);

  const handleCanPlayEvent = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      applyAudioPlaybackSettings(audio, playbackRate);
      const activeDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : effectiveDuration;
      applyPendingRestoreIfReady(audio, activeDuration);
    }
    setIsBuffering(false);
    setHasError(false);
    setErrorDiagnostic(null);
  }, [effectiveDuration, playbackRate, applyPendingRestoreIfReady]);

  const handleErrorEvent = useCallback(async () => {
    const audio = audioRef.current;
    const mediaErrorCode = audio?.error?.code ?? null;
    const mediaErrorLabel = getMediaErrorLabel(mediaErrorCode);
    const mediaErrorMessage =
      audio?.error?.message || 'Sem mensagem adicional do HTMLMediaElement.';

    let httpStatus: number | null = null;
    let contentType: string | null = null;
    let contentRange: string | null = null;
    let contentLength: string | null = null;

    if (assetId) {
      try {
        const probeHeaders = await getSupabaseAuthHeaders({
          Range: 'bytes=0-1023',
          ...(work?.id ? { 'X-CRT-Work-Id': work.id } : {}),
        });
        const probeRes = await fetch(
          `/api/audio/stream/${encodeURIComponent(assetId)}`,
          {
            method: 'GET',
            headers: probeHeaders,
            credentials: 'same-origin',
          }
        );
        httpStatus = probeRes.status;
        contentType = probeRes.headers.get('content-type');
        contentRange = probeRes.headers.get('content-range');
        contentLength = probeRes.headers.get('content-length');
      } catch (probeErr) {
        console.warn(
          '[CRT Audio Player Diagnostic] Falha ao sondar endpoint de streaming:',
          probeErr
        );
      }
    }

    const diag: AudioErrorDiagnostic = {
      mediaErrorCode,
      mediaErrorLabel,
      mediaErrorMessage,
      httpStatus,
      contentType,
      contentRange,
      contentLength,
    };

    console.warn('[CRT Audio Player Diagnostic] Evento error no HTML5 Audio:', {
      workId: work?.id,
      assetId,
      ...diag,
    });

    setErrorDiagnostic(diag);
    setIsPlaying(false);
    setIsBuffering(false);
    setHasError(true);
  }, [assetId, work?.id]);

  const handleRetryStream = useCallback(() => {
    pendingRestoreTimeRef.current =
      currentTime > 0 ? Math.floor(currentTime) : lastSavedSecondsRef.current;
    hasAppliedInitialRestoreRef.current = false;
    setHasError(false);
    setErrorDiagnostic(null);
    setIsBuffering(true);
    setAuthCookieReady(false);
    syncServerAuthSessionCookie()
      .catch(() => false)
      .finally(() => {
        setAuthCookieReady(true);
        setStreamReloadKey((prev) => prev + 1);
      });
  }, [currentTime]);

  const handleTogglePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (err) {
      console.warn(
        '[CRT Audio Player Diagnostic] Exceção ao executar audio.play():',
        err
      );
      if (audio.error) {
        handleErrorEvent();
      }
    }
  }, [hasError, handleErrorEvent]);

  const handleRewind15 = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    hasAppliedInitialRestoreRef.current = true;
    const nextTime = Math.max(0, audio.currentTime - 15);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (effectiveDuration > 0) {
      scheduleDebouncedProgressSave(nextTime, effectiveDuration);
    }
  }, [hasError, effectiveDuration, scheduleDebouncedProgressSave]);

  const handleForward30 = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    hasAppliedInitialRestoreRef.current = true;
    const resolvedDuration =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : effectiveDuration;
    const nextTime =
      resolvedDuration > 0
        ? Math.min(resolvedDuration, audio.currentTime + 30)
        : audio.currentTime + 30;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (resolvedDuration > 0) {
      scheduleDebouncedProgressSave(nextTime, resolvedDuration);
    }
  }, [effectiveDuration, hasError, scheduleDebouncedProgressSave]);

  const handleSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = audioRef.current;
      if (!audio || hasError) return;
      const targetTime = Number(e.target.value);
      if (!Number.isFinite(targetTime) || targetTime < 0) return;
      hasAppliedInitialRestoreRef.current = true;
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
      if (effectiveDuration > 0) {
        scheduleDebouncedProgressSave(targetTime, effectiveDuration);
      }
    },
    [hasError, effectiveDuration, scheduleDebouncedProgressSave]
  );

  useEffect(() => {
    applyAudioPlaybackSettings(audioRef.current, playbackRate);
  }, [playbackRate, assetId, streamReloadKey]);

  const handleChangeSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    applyAudioPlaybackSettings(audioRef.current, rate);
  }, []);

  // Tratamento de interrupções de rede (offline -> online) e retomada automática do ponto salvo
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOfflineInterruption = () => {
      const audio = audioRef.current;
      const savedSec = Math.max(
        currentTime,
        audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      );
      if (savedSec > 0) {
        pendingRestoreTimeRef.current = Math.floor(savedSec);
      }
    };

    const handleOnlineResume = () => {
      if (hasError && assetId) {
        handleRetryStream();
      }
    };

    window.addEventListener('offline', handleOfflineInterruption);
    window.addEventListener('online', handleOnlineResume);
    return () => {
      window.removeEventListener('offline', handleOfflineInterruption);
      window.removeEventListener('online', handleOnlineResume);
    };
  }, [currentTime, hasError, assetId, handleRetryStream]);

  // Integração com Media Session API para controles de tela bloqueada no Android e iOS
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !work
    ) {
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: work.title || 'Audiobook CRT Books',
        artist: work.author || 'CRT Books',
        album: 'CRT Books',
        artwork: work.cover
          ? [{ src: work.cover, sizes: '512x512', type: 'image/webp' }]
          : [
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
            ],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        void handleTogglePlayPause();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        void handleTogglePlayPause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        handleRewind15();
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        handleForward30();
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        const audio = audioRef.current;
        if (
          audio &&
          typeof details.seekTime === 'number' &&
          Number.isFinite(details.seekTime)
        ) {
          audio.currentTime = Math.max(0, details.seekTime);
          setCurrentTime(audio.currentTime);
        }
      });
    } catch {
      // ignora navegadores com suporte parcial a MediaSession
    }
  }, [
    work,
    handleTogglePlayPause,
    handleRewind15,
    handleForward30,
  ]);

  const progressPercent =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
      : 0;

  if (isLoadingWork || !work) {
    return (
      <div className="min-h-screen w-full bg-[#07090E] text-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">
          Carregando audiobook no Player CRT Books...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#07090E] text-[#F8FAFC] flex flex-col selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Elemento nativo HTML5 de streaming via HTTP Range (sessão transmitida por cookie HttpOnly seguro, sem token na URL) */}
      {assetId && authCookieReady && (
        <audio
          key={`${assetId}_${streamReloadKey}`}
          ref={audioRef}
          preload="metadata"
          src={`/api/audio/stream/${encodeURIComponent(assetId)}`}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlayEvent}
          onPause={handlePauseEvent}
          onEnded={handleEndedEvent}
          onSeeking={handleSeekingEvent}
          onSeeked={handleSeekedEvent}
          onWaiting={handleWaitingEvent}
          onCanPlay={handleCanPlayEvent}
          onError={handleErrorEvent}
        />
      )}

      {/* Barra Superior do Player CRT Books */}
      <header className="sticky top-0 z-30 bg-[#0B0F19]/95 backdrop-blur-xl border-b border-white/[0.08] safe-top px-3.5 sm:px-6 min-h-[64px] py-2 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBackClick}
            className="inline-flex items-center gap-1.5 sm:gap-2 min-h-[42px] px-3 sm:px-3.5 py-2 rounded-xl bg-[#131B2E] hover:bg-[#1B253D] border border-white/[0.08] text-xs sm:text-sm font-medium text-slate-200 hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono-tabular uppercase tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-400/25 shrink-0">
                <Headphones className="w-3 h-3" />
                Player CRT Books
              </span>
              {isSeeking || isBuffering ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono-tabular text-slate-400 truncate">
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
                  <span className="truncate">Sincronizando...</span>
                </span>
              ) : lastSavedAtTime !== null && lastSavedAtTime > 0 ? (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono-tabular text-emerald-300/90">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Salvo em {formatAudioTime(lastSavedAtTime)}</span>
                </span>
              ) : null}
            </div>
            <h1 className="text-xs sm:text-base font-display font-bold text-white truncate mt-0.5">
              {work.title || 'Audiobook'}
            </h1>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 shrink-0">
          <span>Por</span>
          <span className="text-slate-200 font-medium">
            {work.author || 'Autor desconhecido'}
          </span>
        </div>
      </header>

      <OfflineTopBanner
        isOnline={isOnline}
        checkingConnection={checkingConnection}
        onRetryConnection={async () => {
          const online = await verifyConnectionNow();
          if (online && hasError) {
            handleRetryStream();
          }
        }}
      />

      {/* Conteúdo Central do Player */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-3.5 sm:px-6 py-5 sm:py-10 safe-bottom flex flex-col items-center justify-center">
        {hasError || !assetId ? (
          <div className="w-full max-w-md rounded-2xl bg-[#0E131F] border border-white/[0.08] p-5 sm:p-7 text-center space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-base sm:text-lg font-display font-bold text-white">
                Não foi possível reproduzir este audiobook.
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Verifique sua conexão ou toque em tentar novamente para retomar
                exatamente do ponto salvo (
                {formatAudioTime(
                  currentTime > 0 ? currentTime : lastSavedSecondsRef.current
                )}
                ).
              </p>
            </div>

            {errorDiagnostic && (
              <div className="rounded-xl bg-[#090D16] border border-white/[0.06] p-3.5 text-left font-mono-tabular text-[11px] text-slate-400 space-y-1">
                <div className="text-slate-300 font-semibold mb-1">
                  Diagnóstico técnico do player:
                </div>
                <div>
                  audio.error.code:{' '}
                  <span className="text-amber-300">
                    {errorDiagnostic.mediaErrorLabel}
                  </span>
                </div>
                <div>
                  audio.error.message:{' '}
                  <span className="text-slate-200 break-words">
                    {errorDiagnostic.mediaErrorMessage}
                  </span>
                </div>
                <div>
                  HTTP Status:{' '}
                  <span className="text-cyan-300">
                    {errorDiagnostic.httpStatus ?? 'N/A'}
                  </span>
                </div>
                <div>
                  Content-Type:{' '}
                  <span className="text-cyan-300">
                    {errorDiagnostic.contentType ?? 'N/A'}
                  </span>
                </div>
              </div>
            )}

            <div className="pt-1 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleBackClick}
                className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 hover:text-white text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar para a obra</span>
              </button>

              {assetId && (
                <button
                  type="button"
                  onClick={handleRetryStream}
                  className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs sm:text-sm font-display font-bold transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retomar reprodução</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full rounded-3xl bg-gradient-to-b from-[#111827]/95 to-[#0B0F19]/98 border border-white/[0.08] p-5 sm:p-10 shadow-[0_28px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col items-center space-y-5 sm:space-y-7">
            {/* Capa ou Placeholder da Obra */}
            <div className="relative">
              <BookCover
                work={work}
                size="xl"
                className="shadow-[0_20px_50px_rgba(0,0,0,0.75)]"
              />
            </div>

            {/* Título, Autor e Indicador de Ponto Restaurado */}
            <div className="text-center space-y-1.5 max-w-lg px-1">
              <h2 className="text-lg sm:text-2xl font-display font-bold text-white tracking-tight">
                {work.title}
              </h2>
              <p className="text-xs sm:text-base font-medium text-slate-400">
                {work.author}
              </p>
              {restoredFromTime !== null && restoredFromTime > 0 && (
                <p className="text-[11px] sm:text-xs font-mono-tabular text-cyan-300/90 pt-1">
                  Continuando de {formatAudioTime(restoredFromTime)} ·{' '}
                  {Math.min(
                    100,
                    Math.max(
                      1,
                      Math.round(
                        (currentTime / Math.max(1, effectiveDuration)) * 100
                      )
                    )
                  )}
                  % concluído
                </p>
              )}
            </div>

            {/* Barra de Progresso Interativa (Seek com HTTP Range) e Tempos */}
            <div className="w-full space-y-2 pt-1">
              <div className="relative w-full flex items-center py-2">
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration > 0 ? effectiveDuration : 100}
                  step={1}
                  value={Math.min(
                    currentTime,
                    effectiveDuration > 0 ? effectiveDuration : 100
                  )}
                  onChange={handleSeekChange}
                  aria-label="Barra de progresso do audiobook"
                  className="w-full h-2.5 rounded-lg appearance-none bg-[#1B2436] accent-cyan-400 cursor-pointer focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${progressPercent}%, #1B2436 ${progressPercent}%, #1B2436 100%)`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-400">
                <span className="text-cyan-300 font-semibold">
                  {formatAudioTime(currentTime)}
                </span>
                <span>{formatAudioTime(effectiveDuration)}</span>
              </div>
            </div>

            {/* Controles Principais: -15s | Play/Pause | +30s */}
            <div className="flex items-center justify-center gap-5 sm:gap-8 pt-1">
              <button
                type="button"
                onClick={handleRewind15}
                title="Voltar 15 segundos"
                className="inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-[#131B2E] hover:bg-[#1B2640] border border-white/[0.08] text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 mb-0.5 text-cyan-400" />
                <span className="text-[11px] font-mono-tabular font-semibold">
                  -15s
                </span>
              </button>

              <button
                type="button"
                onClick={handleTogglePlayPause}
                aria-label={
                  isPlaying ? 'Pausar audiobook' : 'Reproduzir audiobook'
                }
                className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_36px_rgba(34,211,238,0.35)] transition-all active:scale-95 cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-slate-950 text-slate-950" />
                ) : (
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-slate-950 text-slate-950 ml-1" />
                )}
              </button>

              <button
                type="button"
                onClick={handleForward30}
                title="Avançar 30 segundos"
                className="inline-flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-[#131B2E] hover:bg-[#1B2640] border border-white/[0.08] text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                <RotateCw className="w-4 h-4 mb-0.5 text-cyan-400" />
                <span className="text-[11px] font-mono-tabular font-semibold">
                  +30s
                </span>
              </button>
            </div>

            {/* Controle de Velocidade: 0.85x | 0.9x | 0.95x | 1.0x | 1.25x | 1.5x | 2.0x */}
            <div className="w-full pt-3 border-t border-white/[0.06] flex flex-col items-center justify-between gap-2.5">
              <div className="w-full flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Velocidade de reprodução
                </span>
                <span className="text-xs font-mono-tabular font-semibold text-cyan-300">
                  {formatPlaybackRateLabel(playbackRate)}
                </span>
              </div>

              <div className="w-full grid grid-cols-4 sm:grid-cols-7 gap-1.5 sm:gap-2">
                {PLAYBACK_RATES.map((rate) => {
                  const isSelected = Math.abs(playbackRate - rate) < 0.001;
                  const label = formatPlaybackRateLabel(rate);
                  return (
                    <button
                      key={rate}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleChangeSpeed(rate)}
                      className={`min-h-[38px] px-2 py-1.5 rounded-xl font-mono-tabular text-xs font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
                          : 'bg-[#131B2E] hover:bg-[#1B253D] text-slate-300 hover:text-white border-white/[0.08]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
