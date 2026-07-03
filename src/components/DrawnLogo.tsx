import React from 'react';

interface DrawnLogoProps {
  className?: string;
  showTagline?: boolean;
  animated?: boolean;
}

export default function DrawnLogo({ className = '', showTagline = true, animated = true }: DrawnLogoProps) {
  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`} id="drawn-brand-logo-root">
      <svg
        viewBox="0 0 650 320"
        className={`w-full h-auto max-w-[420px] sm:max-w-[480px] filter drop-shadow-md ${
          animated ? 'animate-[wiggle_6s_ease-in-out_infinite]' : ''
        }`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="DRAWN Logo"
      >
        <defs>
          {/* Load Fredoka font dynamically */}
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@900&display=swap');
            .brand-bubble {
              font-family: 'Fredoka', 'Comic Sans MS', sans-serif;
              font-weight: 900;
              text-anchor: middle;
              dominant-baseline: middle;
            }
            @keyframes wiggle {
              0%, 100% { transform: rotate(-1.5deg) scale(1); }
              50% { transform: rotate(1.5deg) scale(1.02); }
            }
          `}</style>

          {/* Filters for dropshadows */}
          <filter id="logo-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="12" stdDeviation="6" floodColor="#0b112c" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* 1. BACKGROUND SPLAYERS & SPLASHES */}
        <g id="splashes-group">
          {/* Blue Splatter Left */}
          <circle cx="80" cy="180" r="14" fill="#38bdf8" />
          <path d="M80 180 Q50 200 65 220" stroke="#38bdf8" strokeWidth="10" strokeLinecap="round" />
          
          {/* Green Splatter Top Left */}
          <circle cx="160" cy="80" r="10" fill="#4ade80" />
          <path d="M160 80 Q145 60 170 50" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" />

          {/* Yellow Splatter Top Right */}
          <circle cx="390" cy="65" r="12" fill="#facc15" />
          
          {/* Pink Splatter Right */}
          <circle cx="560" cy="160" r="12" fill="#f472b6" />
          <path d="M560 160 Q590 140 575 125" stroke="#f472b6" strokeWidth="8" strokeLinecap="round" />
          
          {/* Purple Splatter Bottom Right */}
          <circle cx="540" cy="245" r="9" fill="#c084fc" />
        </g>

        {/* 2. THE MASCOT NOTEBOOK (Behind AWN letters) */}
        <g id="mascot-notebook-behind" transform="translate(35, -25) rotate(4 250 150)">
          {/* Soft drop shadow */}
          <rect x="235" y="75" width="210" height="150" rx="24" fill="#0b112c" opacity="0.15" />
          
          {/* White Card Backing (Sticker border style) */}
          <rect x="225" y="65" width="220" height="160" rx="28" fill="#ffffff" stroke="#0b112c" strokeWidth="8" strokeLinejoin="round" />
          
          {/* Inner Sheet */}
          <rect x="235" y="75" width="200" height="140" rx="18" fill="#f8fafc" />

          {/* Wire spirals */}
          <rect x="255" y="45" width="14" height="32" rx="7" fill="#64748b" stroke="#0b112c" strokeWidth="5" />
          <rect x="295" y="45" width="14" height="32" rx="7" fill="#64748b" stroke="#0b112c" strokeWidth="5" />
          <rect x="335" y="45" width="14" height="32" rx="7" fill="#64748b" stroke="#0b112c" strokeWidth="5" />
          <rect x="375" y="45" width="14" height="32" rx="7" fill="#64748b" stroke="#0b112c" strokeWidth="5" />
          <rect x="415" y="45" width="14" height="32" rx="7" fill="#64748b" stroke="#0b112c" strokeWidth="5" />

          {/* Face: cute winking and smiling */}
          {/* Left Eye: Normal circle */}
          <circle cx="295" cy="130" r="10" fill="#0b112c" />
          <circle cx="292" cy="127" r="3" fill="#ffffff" />
          
          {/* Right Eye: Wink curved path */}
          <path d="M365 135 Q375 120 385 135" stroke="#0b112c" strokeWidth="7" strokeLinecap="round" fill="none" />
          
          {/* Playful curved tongue out/big smile */}
          <path d="M310 155 Q335 180 360 155" stroke="#0b112c" strokeWidth="7" strokeLinecap="round" fill="none" />
          
          {/* Cheeks */}
          <circle cx="275" cy="155" r="8" fill="#f472b6" opacity="0.5" />
          <circle cx="385" cy="155" r="8" fill="#f472b6" opacity="0.5" />
        </g>

        {/* 3. MASCOT PENCIL */}
        <g id="mascot-pencil" transform="translate(195, -55) rotate(48 250 150)">
          {/* Pencil Body Yellow */}
          <path d="M225 150 L255 150 L255 230 L225 230 Z" fill="#f59e0b" stroke="#0b112c" strokeWidth="7" strokeLinejoin="round" />
          <rect x="234" y="150" width="12" height="80" fill="#fbbf24" />
          
          {/* Wood sharpened part */}
          <path d="M225 230 L255 230 L240 260 Z" fill="#fed7aa" stroke="#0b112c" strokeWidth="7" strokeLinejoin="round" />
          {/* Lead core */}
          <path d="M234 248 L246 248 L240 260 Z" fill="#0b112c" />

          {/* Silver Ferrule */}
          <rect x="225" y="137" width="30" height="13" fill="#94a3b8" stroke="#0b112c" strokeWidth="7" strokeLinejoin="round" />
          {/* Pink Eraser */}
          <path d="M225 137 L255 137 C255 122 225 122 225 137 Z" fill="#f472b6" stroke="#0b112c" strokeWidth="7" strokeLinejoin="round" />
        </g>

        {/* 4. THE DRAWN 3D BUBBLE LETTERS */}
        {/* We use offset stacking for 3D sticker style */}
        <g id="drawn-letters-sticker">
          {/* List of letters, their starting colors, 3D colors, positions, and rotation angles */}
          {[
            { char: 'D', color: '#38bdf8', depthColor: '#0284c7', x: 105, y: 175, rot: -8 },
            { char: 'R', color: '#4ade80', depthColor: '#16a34a', x: 200, y: 170, rot: -3 },
            { char: 'A', color: '#facc15', depthColor: '#ca8a04', x: 295, y: 172, rot: 2 },
            { char: 'W', color: '#c084fc', depthColor: '#9333ea', x: 395, y: 175, rot: -2 },
            { char: 'N', color: '#f472b6', depthColor: '#db2777', x: 495, y: 178, rot: 6 },
          ].map((item, idx) => (
            <g key={idx} transform={`translate(${item.x}, ${item.y}) rotate(${item.rot})`} className="cursor-pointer">
              {/* Layer 1: Strong dark sticker outline */}
              <text className="brand-bubble" fontSize="105" fill="#0b112c" stroke="#0b112c" strokeWidth="28" strokeLinejoin="round" y="0">
                {item.char}
              </text>
              
              {/* Layer 2: White paper border */}
              <text className="brand-bubble" fontSize="105" fill="#ffffff" stroke="#ffffff" strokeWidth="18" strokeLinejoin="round" y="0">
                {item.char}
              </text>

              {/* Layer 3: Extra outer shadow border for contrast */}
              <text className="brand-bubble" fontSize="105" fill="#0b112c" stroke="#0b112c" strokeWidth="10" strokeLinejoin="round" y="0">
                {item.char}
              </text>

              {/* Layer 4: 3D Depth Layer (Shifted down) */}
              <text className="brand-bubble" fontSize="105" fill={item.depthColor} stroke={item.depthColor} strokeWidth="4" strokeLinejoin="round" y="8">
                {item.char}
              </text>

              {/* Layer 5: Main Color Fill */}
              <text className="brand-bubble" fontSize="105" fill={item.color} y="0">
                {item.char}
              </text>

              {/* Layer 6: Inside glossy highlights (white circle on top left) */}
              <circle cx="-16" cy="-28" r="7" fill="#ffffff" opacity="0.85" />
              <circle cx="-24" cy="-18" r="4" fill="#ffffff" opacity="0.65" />
            </g>
          ))}
        </g>

        {/* 5. DRAW. GUESS. LAUGH. REPEAT. TAGLINE RIBBON */}
        {showTagline && (
          <g id="tagline-ribbon" transform="translate(300, 275)">
            {/* Dark curved ribbon backing */}
            <path
              d="M-210 -15 Q0 -25 210 -15 L200 18 Q0 8 -200 18 Z"
              fill="#0b112c"
              stroke="#0b112c"
              strokeWidth="6"
              strokeLinejoin="round"
            />
            
            {/* Tagline white text */}
            <text
              className="brand-bubble font-semibold"
              fontSize="14.5"
              fill="#ffffff"
              letterSpacing="2.5"
              y="1.5"
            >
              <tspan fill="#38bdf8">DRAW</tspan>. <tspan fill="#4ade80">GUESS</tspan>. <tspan fill="#facc15">LAUGH</tspan>. <tspan fill="#f472b6">REPEAT</tspan>.
            </text>

            {/* Side squiggles representing wind/motion */}
            <path d="M-240 -12 Q-225 -15 -215 -10" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M-235 -2 Q-220 -5 -215 0" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" fill="none" />
            
            <path d="M215 -10 Q225 -15 240 -12" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M215 0 Q220 -5 235 -2" stroke="#facc15" strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>
        )}
      </svg>
    </div>
  );
}
