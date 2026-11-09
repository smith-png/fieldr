import React, { useEffect, useState } from 'react'

interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 800,
  className = ''
}) => {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    let startTime: number | null = null
    const startValue = displayValue
    const delta = value - startValue

    if (delta === 0) return

    let animationFrameId: number

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startValue + delta * easeProgress)
      setDisplayValue(current)

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step)
      } else {
        setDisplayValue(value)
      }
    }

    animationFrameId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [value, duration])

  return (
    <span className={`tabular-nums font-mono ${className}`}>
      {displayValue.toLocaleString()}
    </span>
  )
}
