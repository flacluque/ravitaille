/** Icônes dessinées, même trait partout (1,9 px, bouts arrondis), à la couleur du texte. */
const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

type IconProps = { size?: number };

export const RouteIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M5 19c3-1 3-5 7-6s4-6 7-8" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /></svg>
);
export const StopwatchIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M10 2h4" /></svg>
);
export const BottleIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M9 3h6M10 3v3l-2 3v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9l-2-3V3" /><path d="M8 13h8" /></svg>
);
export const BackpackIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><path d="M6 8a6 6 0 0 1 12 0v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2M9 14h6" /></svg>
);
export const BarrierIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><rect x="3" y="7" width="18" height="6" rx="1" /><path d="M7 7l-3 6M12 7l-3 6M17 7l-3 6M6 13v7M18 13v7" /></svg>
);
export const MoreIcon = ({ size = 22 }: IconProps) => (
  <svg {...base} width={size} height={size}><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></svg>
);
