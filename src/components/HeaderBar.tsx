import React, { useEffect, useState } from 'react'
import { BrandMark } from './BrandMark'

interface HeaderBarProps {
  onOpenMenu: () => void
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ onOpenMenu }) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        // Scrolling down past threshold -> hide
        setIsVisible(false)
      } else {
        // Scrolling up or near top -> show
        setIsVisible(true)
      }
      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 pointer-events-none transition-transform duration-300 ease-in-out ${
        isVisible ? 'translate-y-0' : '-translate-y-28'
      }`}
    >
      <div className="p-6 md:p-10 pointer-events-auto inline-block">
        <BrandMark onClick={onOpenMenu} />
      </div>
    </header>
  )
}
