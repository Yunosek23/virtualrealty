import { useRef, useEffect, type FC } from 'react'

interface RevealLayerProps {
  image: string
  cursorX: number
  cursorY: number
  spotlightR: number
}

const RevealLayer: FC<RevealLayerProps> = ({ image, cursorX, cursorY, spotlightR }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)

  /* Resize canvas to viewport */
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current
      if (!c) return
      c.width = window.innerWidth
      c.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  /* Draw spotlight mask every frame */
  useEffect(() => {
    const c = canvasRef.current
    const div = revealRef.current
    if (!c || !div) return

    const ctx = c.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, c.width, c.height)

    const grad = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, spotlightR)
    grad.addColorStop(0,    'rgba(99,102,241,0.9)')
    grad.addColorStop(0.4,  'rgba(99,102,241,0.7)')
    grad.addColorStop(0.6,  'rgba(99,102,241,0.4)')
    grad.addColorStop(0.75, 'rgba(99,102,241,0.2)')
    grad.addColorStop(0.88, 'rgba(99,102,241,0.05)')
    grad.addColorStop(1,    'rgba(99,102,241,0)')

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cursorX, cursorY, spotlightR, 0, Math.PI * 2)
    ctx.fill()

    const dataUrl = c.toDataURL()
    div.style.maskImage = `url(${dataUrl})`
    div.style.webkitMaskImage = `url(${dataUrl})`
    div.style.maskSize = '100% 100%'
    div.style.webkitMaskSize = '100% 100%'
    div.style.maskRepeat = 'no-repeat'
    div.style.webkitMaskRepeat = 'no-repeat'
  }, [cursorX, cursorY, spotlightR])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <div
        ref={revealRef}
        className="absolute inset-0 bg-center bg-cover bg-no-repeat z-30 pointer-events-none"
        style={{ backgroundImage: `url(${image})` }}
      />
    </>
  )
}

export default RevealLayer
