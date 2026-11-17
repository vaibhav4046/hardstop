'use client'

// Sections marked `.reveal` fade and rise into place as they are scrolled to.
// Nothing is hidden until the visitor actually scrolls with a wheel or a
// finger, and then only what is still below the screen, so a page that is
// read, printed or captured without scrolling shows everything.

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function ScrollReveal() {
  const pathname = usePathname()

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.remove('reveal-wait')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    const arm = () => {
      for (const element of document.querySelectorAll('.reveal')) {
        if (element.getBoundingClientRect().top <= innerHeight) continue
        element.classList.add('reveal-wait')
        observer.observe(element)
      }
    }
    const options = { once: true, passive: true }
    addEventListener('wheel', arm, options)
    addEventListener('touchmove', arm, options)
    return () => {
      removeEventListener('wheel', arm)
      removeEventListener('touchmove', arm)
      observer.disconnect()
      for (const element of document.querySelectorAll('.reveal-wait')) element.classList.remove('reveal-wait')
    }
  }, [pathname])

  return null
}
