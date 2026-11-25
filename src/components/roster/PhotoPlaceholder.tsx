import React from 'react'

/** Soft silhouette shown behind a player photo so the slot is never empty while the image loads. */
export const PhotoPlaceholder: React.FC = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 64 64"
    fill="currentColor"
    preserveAspectRatio="xMidYMax slice"
    className="absolute inset-0 w-full h-full text-muted/30 pointer-events-none"
  >
    <circle cx="32" cy="25" r="11" />
    <path d="M10 64c0-13 10-22 22-22s22 9 22 22z" />
  </svg>
)
