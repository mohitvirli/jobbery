'use client'

// Decorative product teaser at the bottom of the login screen: two app
// screenshots (light + dark) fanned out and cut off by the viewport edge, so
// the dashboard "peeks up" behind the sign-in form. Desktop-only — on small or
// short screens it's hidden so it never crowds the form.
//
// The cards are purely decorative (aria-hidden); the screenshots carry no
// information the user needs to act on.

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'

export function LoginPreview() {
  const reduce = useReducedMotion()

  // Shared card chrome — rounded, bordered, heavy shadow to lift off the page.
  const cardClass =
    'overflow-hidden rounded-xl border border-border bg-background shadow-2xl'
  // Each screenshot is 1572x1007 (~1.56:1). We render at a fixed width and let
  // height follow the ratio.
  const imgW = 520
  const imgH = Math.round((imgW * 1007) / 1572)

  return (
    <div
      aria-hidden
      // Hidden under lg and on short viewports so the form stays the hero.
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-64 justify-center overflow-hidden lg:flex [@media(max-height:740px)]:lg:hidden"
    >
      {/* Cards translate down so only the top ~40% shows above the edge. */}
      <div className="relative mt-auto h-72 w-[760px] translate-y-24">
        {/* Dark card — behind, rotated left. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28, rotate: -6 }}
          animate={{ opacity: 1, y: 0, rotate: -6 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
          className="absolute left-6 top-4 origin-bottom"
        >
          <div className={cardClass}>
            <Image
              src="/preview-dark.png"
              alt=""
              width={imgW}
              height={imgH}
              className="opacity-90"
            />
          </div>
        </motion.div>

        {/* Light card — front, rotated right, lifted. */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 32, rotate: 4 }}
          animate={{ opacity: 1, y: 0, rotate: 4 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.12 }}
          className="absolute right-6 top-0 origin-bottom"
        >
          <div className={cardClass}>
            <Image
              src="/preview-light.png"
              alt=""
              width={imgW}
              height={imgH}
              priority
            />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
