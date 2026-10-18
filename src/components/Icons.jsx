// Íconos de línea de la navegación (sin emojis: se ven igual en todos los celus)
function Svg({ children, size = 22 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Svg><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>
);

export const ClipsIcon = () => (
  <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" /></Svg>
);

export const SearchIcon = () => (
  <Svg><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
);

export const ClubIcon = () => (
  <Svg><path d="M4 21V8l8-5 8 5v13" /><path d="M9 21v-6h6v6" /></Svg>
);

export const UserIcon = () => (
  <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></Svg>
);

export const ChevronIcon = () => (
  <Svg size={18}><path d="M9 6l6 6-6 6" /></Svg>
);

export const PlusIcon = () => (
  <Svg><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Svg>
);

export const ShareIcon = () => (
  <Svg size={20}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v12M7 8l5-5 5 5" /></Svg>
);

export const DownloadIcon = () => (
  <Svg size={20}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 19h16" /></Svg>
);

export const GlobeIcon = () => (
  <Svg size={20}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></Svg>
);

export const FlagIcon = () => (
  <Svg size={20}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Svg>
);
