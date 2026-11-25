import React, { useCallback, useEffect, useRef, useState } from 'react'

interface HeroWordProps {
  word: string
  playIntro: boolean
}

export const HeroWord: React.FC<HeroWordProps> = ({ word, playIntro }) => {
  const [filled, setFilled] = useState(false)
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  useEffect(() => {
    if (!playIntro) return
    timersRef.current = [
      window.setTimeout(() => setFilled(true), 350),
      window.setTimeout(() => setFilled(false), 1900)
    ]
    return clearTimers
  }, [playIntro, clearTimers])

  const handleToggle = useCallback(() => {
    clearTimers()
    setFilled((prev) => !prev)
  }, [clearTimers])

  return (
    <div
      className="hero-word-stage"
      data-filled={filled ? 'true' : 'false'}
      onClick={handleToggle}
    >
      <h1 className="hero-word hero-word-outline">{word}</h1>
      <span aria-hidden="true" className="hero-word hero-word-fill">
        {word}
      </span>
    </div>
  )
}
