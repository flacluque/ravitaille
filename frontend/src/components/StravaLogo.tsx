/** Logo de Strava (les deux chevrons), pour signaler ce qui vient de Strava. */
export function StravaLogo({ size = 16 }: { size?: number }) {
  return (
    <svg className="strava-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path fill="currentColor"
        d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}
