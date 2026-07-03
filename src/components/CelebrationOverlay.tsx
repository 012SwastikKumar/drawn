import React, { useEffect, useRef, useState } from 'react';

// Chiptune Audio Synthesizer via Web Audio API
export class SoundEffects {
  private static ctx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const isEnabled = window.localStorage.getItem('scribble_sound_enabled') !== 'false';
    if (!isEnabled) return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  static playCorrect() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Play a delightful rising arpeggio (C4 -> E4 -> G4 -> C5 -> E5)
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      
      gain.gain.setValueAtTime(0.12, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.25);
    });
  }

  static playVictory() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Play a triumphant retro fanfare
    const notes = [
      { f: 261.63, d: 0.12 }, // C4
      { f: 329.63, d: 0.12 }, // E4
      { f: 392.00, d: 0.12 }, // G4
      { f: 523.25, d: 0.12 }, // C5
      { f: 392.00, d: 0.12 }, // G4
      { f: 523.25, d: 0.4 },  // C5 (long held note)
    ];
    let time = now;
    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.f, time);
      
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + note.d);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + note.d);
      
      time += 0.09;
    });
  }

  static playRoundEnd() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Play a nice warm jazzy major 7th chord roll
    const notes = [261.63, 329.63, 392.00, 493.88]; // C4, E4, G4, B4
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      
      gain.gain.setValueAtTime(0.12, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.4);
    });
  }

  static playSelect() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.06);
  }

  static playTick(isUrgent: boolean = false) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    const freq = isUrgent ? 850 : 650;
    const duration = isUrgent ? 0.08 : 0.05;
    const volume = isUrgent ? 0.08 : 0.04;
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + duration);
  }
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  opacity: number;
  shape: 'circle' | 'square' | 'star' | 'emoji';
  emoji?: string;
  gravity: number;
}

interface SplashNotification {
  id: string;
  text: string;
  emoji: string;
}

interface CelebrationOverlayProps {
  correctGuessTrigger?: number; // Inc to trigger correctness burst
  roundEndTrigger?: number; // Inc to trigger round end
  gameOverTrigger?: number; // Inc to trigger full game over shower
  winnerName?: string;
  guesserName?: string;
}

export default function CelebrationOverlay({
  correctGuessTrigger = 0,
  roundEndTrigger = 0,
  gameOverTrigger = 0,
  winnerName = '',
  guesserName = '',
}: CelebrationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const lastParticleIdRef = useRef<number>(0);
  const [splashes, setSplashes] = useState<SplashNotification[]>([]);

  // Track triggers to prevent double firing on initial mount
  const prevCorrectRef = useRef<number>(correctGuessTrigger);
  const prevRoundRef = useRef<number>(roundEndTrigger);
  const prevGameOverRef = useRef<number>(gameOverTrigger);

  const colors = [
    '#38bdf8', // sky-400
    '#34d399', // emerald-400
    '#a78bfa', // violet-400
    '#fb7185', // rose-400
    '#fbbf24', // amber-400
    '#60a5fa', // blue-400
    '#f472b6', // pink-400
  ];

  const emojis = ['🎉', '⭐', '✨', '👑', '🎨', '🔥', '💡', '🏆', '💯', '🚀'];

  const addParticles = (
    count: number,
    x: number,
    y: number,
    type: 'correct' | 'round_end' | 'game_over'
  ) => {
    const newParticles: Particle[] = [];
    
    for (let i = 0; i < count; i++) {
      const angle = type === 'correct' 
        ? Math.random() * Math.PI * 2 
        : (Math.random() * Math.PI) / 2 + (x < window.innerWidth / 2 ? -Math.PI / 4 : -Math.PI * 0.75); // spray inward from corners

      const speed = type === 'game_over' 
        ? Math.random() * 12 + 4 
        : Math.random() * 8 + 3;

      const size = type === 'game_over'
        ? Math.random() * 14 + 8
        : Math.random() * 10 + 6;

      const randomShape = Math.random();
      let shape: 'circle' | 'square' | 'star' | 'emoji' = 'square';
      let emoji: string | undefined = undefined;

      if (randomShape < 0.25) shape = 'circle';
      else if (randomShape < 0.5) shape = 'square';
      else if (randomShape < 0.8) shape = 'star';
      else {
        shape = 'emoji';
        emoji = emojis[Math.floor(Math.random() * emojis.length)];
      }

      newParticles.push({
        id: lastParticleIdRef.current++,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === 'correct' ? 4 : 2), // upward initial boost
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size,
        opacity: 1,
        shape,
        emoji,
        gravity: type === 'game_over' ? 0.22 : 0.18,
      });
    }

    particlesRef.current = [...particlesRef.current, ...newParticles];
  };

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string, opacity: number) => {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);

    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }

    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  useEffect(() => {
    // 1. Correct Guess Event Handling
    if (correctGuessTrigger > prevCorrectRef.current) {
      prevCorrectRef.current = correctGuessTrigger;
      SoundEffects.playCorrect();

      // Trigger burst in middle-lower of the screen
      addParticles(40, window.innerWidth / 2, window.innerHeight * 0.7, 'correct');

      // Add a fancy on-screen floating notification
      const text = guesserName 
        ? `🔥 ${guesserName.toUpperCase()} NAILED THE WORD! +100 PTS`
        : `🔥 PERFECT GUESS! +100 PTS`;

      const newSplash: SplashNotification = {
        id: Math.random().toString(),
        text,
        emoji: '💡',
      };
      setSplashes((prev) => [...prev, newSplash]);
      setTimeout(() => {
        setSplashes((prev) => prev.filter((s) => s.id !== newSplash.id));
      }, 4000);
    }

    // 2. Round End Event Handling
    if (roundEndTrigger > prevRoundRef.current) {
      prevRoundRef.current = roundEndTrigger;
      SoundEffects.playRoundEnd();

      // Spray confetti fountains from both bottom corners of the viewport
      addParticles(35, 30, window.innerHeight - 50, 'round_end');
      addParticles(35, window.innerWidth - 30, window.innerHeight - 50, 'round_end');

      const newSplash: SplashNotification = {
        id: Math.random().toString(),
        text: `🏁 ROUND COMPLETED! EXCELLENT SKETCHES`,
        emoji: '🎨',
      };
      setSplashes((prev) => [...prev, newSplash]);
      setTimeout(() => {
        setSplashes((prev) => prev.filter((s) => s.id !== newSplash.id));
      }, 4000);
    }

    // 3. Game Over Event Handling
    if (gameOverTrigger > prevGameOverRef.current) {
      prevGameOverRef.current = gameOverTrigger;
      SoundEffects.playVictory();

      // Double heavy corner sprays
      addParticles(60, 40, window.innerHeight - 50, 'game_over');
      addParticles(60, window.innerWidth - 40, window.innerHeight - 50, 'game_over');

      // Add continuous periodic mini-bursts for 4 seconds
      const interval = setInterval(() => {
        addParticles(15, Math.random() * window.innerWidth, window.innerHeight * 0.3, 'correct');
      }, 550);

      const nameToDisplay = winnerName || 'THE DRAWING MASTER';
      const newSplash: SplashNotification = {
        id: Math.random().toString(),
        text: `🏆 CONGRATULATIONS TO ${nameToDisplay.toUpperCase()} - THE GRAND CHAMPION!`,
        emoji: '👑',
      };
      setSplashes((prev) => [...prev, newSplash]);

      setTimeout(() => {
        clearInterval(interval);
      }, 4500);

      setTimeout(() => {
        setSplashes((prev) => prev.filter((s) => s.id !== newSplash.id));
      }, 6000);
    }
  }, [correctGuessTrigger, roundEndTrigger, gameOverTrigger, winnerName, guesserName]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const updateAndDraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.map((p) => {
        const nextX = p.x + p.vx;
        const nextY = p.y + p.vy;
        const nextVy = p.vy + p.gravity;
        const nextRot = p.rotation + p.rotationSpeed;
        const nextOpacity = p.opacity - 0.008; // gradual fadeout

        return {
          ...p,
          x: nextX,
          y: nextY,
          vy: nextVy,
          rotation: nextRot,
          opacity: nextOpacity,
        };
      }).filter((p) => p.opacity > 0 && p.y < canvas.height + 20);

      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.opacity;

        if (p.shape === 'circle') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'square') {
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          // 3D spinning effect by scaling height
          const scaleY = Math.abs(Math.cos(p.rotation));
          ctx.fillRect(-p.size / 2, (-p.size / 2) * scaleY, p.size, p.size * scaleY);
        } else if (p.shape === 'star') {
          drawStar(ctx, p.x, p.y, 5, p.size, p.size / 2, p.color, p.opacity);
        } else if (p.shape === 'emoji' && p.emoji) {
          ctx.font = `${p.size + 12}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillText(p.emoji, 0, 0);
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(updateAndDraw);
    };

    animId = requestAnimationFrame(updateAndDraw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <>
      {/* 2D Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-50 block"
        style={{ pointerEvents: 'none' }}
      />

      {/* Slide-in Splash Toast Overlay for maximum satisfaction */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-50 pointer-events-none w-full max-w-lg px-4 select-none">
        {splashes.map((s) => (
          <div
            key={s.id}
            className="w-full bg-white/95 border border-slate-200/80 text-slate-800 px-5 py-4 rounded-2xl shadow-drawn-lg flex items-center gap-3 animate-[slideInUp_0.35s_cubic-bezier(0.16,1,0.3,1)]"
            style={{
              backdropFilter: 'blur(12px)',
            }}
          >
            <span className="text-2xl shrink-0 animate-bounce">{s.emoji}</span>
            <div className="flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">DRAWN Live</span>
              <p className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 leading-tight">
                {s.text}
              </p>
            </div>
            <div className="w-2 h-2 rounded-full bg-brand-primary animate-ping shrink-0" />
          </div>
        ))}
      </div>

      {/* Simple dynamic animation stylesheet to slide notifications down/up */}
      <style>{`
        @keyframes slideInUp {
          from {
            transform: translateY(-40px) scale(0.92);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
