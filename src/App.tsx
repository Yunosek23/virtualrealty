import { useState, useRef, useEffect } from 'react'
import { 
  Search, 
  Loader2, 
  ArrowLeft, 
  Plus, 
  Minus, 
  ChevronUp, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight, 
  Compass, 
  Play, 
  Pause, 
  PenTool, 
  Check, 
  Trash2,
  Undo2,
  Redo2,
  Eye,
  EyeOff
} from 'lucide-react'
import Navbar from './components/Navbar'
import { GlobeBackground, type GlobeHandle } from './components/GlobeBackground'
import { GOOGLE_API_KEY } from './lib/google-maps'
import "cesium/Source/Widgets/widgets.css"


/** Computes the centroid of coordinate coordinates */
const getCentroidOfCoords = (coords: { lat: number; lng: number }[]) => {
  if (coords.length === 0) return null
  if (coords.length < 3) {
    // Fallback to mean center for 1 or 2 points
    let sumLat = 0
    let sumLng = 0
    for (const c of coords) {
      sumLat += c.lat
      sumLng += c.lng
    }
    return {
      lat: sumLat / coords.length,
      lng: sumLng / coords.length,
    }
  }

  // Calculate 2D Polygon Centroid
  const n = coords.length
  let area = 0
  let cx = 0
  let cy = 0

  for (let i = 0; i < n; i++) {
    const p1 = coords[i]
    const p2 = coords[(i + 1) % n]
    
    const factor = (p1.lng * p2.lat) - (p2.lng * p1.lat)
    area += factor
    cx += (p1.lng + p2.lng) * factor
    cy += (p1.lat + p2.lat) * factor
  }

  area = area / 2.0
  if (Math.abs(area) < 1e-10) {
    // Fallback to mean if area is zero (collinear points)
    let sumLat = 0
    let sumLng = 0
    for (const c of coords) {
      sumLat += c.lat
      sumLng += c.lng
    }
    return {
      lat: sumLat / coords.length,
      lng: sumLng / coords.length,
    }
  }

  cx = cx / (6.0 * area)
  cy = cy / (6.0 * area)

  return {
    lat: cy,
    lng: cx,
  }
}

export default function App() {
  const globeRef = useRef<GlobeHandle>(null)
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* SaaS application states */
  const [isSearched, setIsSearched] = useState(false)

  /* Search bar focus for pulse-glow */
  const [searchFocused, setSearchFocused] = useState(false)

  /* Orbit mode: when true, hero UI fades out and map goes fullscreen */
  const [isAutoRotating, setIsAutoRotating] = useState(true)

  /* Core Drawing states managed in React model */
  const [points, setPoints] = useState<{ lat: number; lng: number }[]>([])
  const [future, setFuture] = useState<{ lat: number; lng: number }[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [isMouseOnMap, setIsMouseOnMap] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [isLabelsLocked, setIsLabelsLocked] = useState(false)
  const isButtonDisabled = isLabelsLocked
  const [isUiHidden, setIsUiHidden] = useState(false)
  const [activeStep, setActiveStep] = useState(1)
  const [activeTab, setActiveTab] = useState('Features')
  const heroOverlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Trigger window resize to recalculate Cesium canvas dimensions instantly on panel toggle
    window.dispatchEvent(new Event('resize'))
  }, [isUiHidden])

  useEffect(() => {
    if (isSearched) return

    const handleScroll = () => {
      if (heroOverlayRef.current) {
        const scrollTop = heroOverlayRef.current.scrollTop
        if (scrollTop < 250) {
          setActiveTab('Features')
        }
      }
    }

    const scrollContainer = heroOverlayRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll)
    }

    const observerOptions = {
      root: heroOverlayRef.current,
      rootMargin: '-25% 0px -45% 0px',
      threshold: 0.1
    }

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const step = entry.target.getAttribute('data-step')
          if (step) {
            setActiveStep(parseInt(step, 10))
          }
        }
      })
    }

    const observer = new IntersectionObserver(handleIntersect, observerOptions)
    const stepElements = document.querySelectorAll('[data-step]')
    stepElements.forEach(el => observer.observe(el))

    // Section Observer for active tab spy
    const sectionObserverOptions = {
      root: heroOverlayRef.current,
      threshold: 0.4
    }
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveTab('How It Works')
        }
      })
    }, sectionObserverOptions)

    const section = document.getElementById('how-it-works')
    if (section) sectionObserver.observe(section)

    // Section Observer for pricing tab spy
    const pricingObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveTab('Pricing')
        }
      })
    }, {
      root: heroOverlayRef.current,
      threshold: 0.3
    })

    const pricingSection = document.getElementById('pricing')
    if (pricingSection) pricingObserver.observe(pricingSection)

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll)
      }
      observer.disconnect()
      sectionObserver.disconnect()
      pricingObserver.disconnect()
    }
  }, [isSearched])

  const handleLabelsLockChange = (locked: boolean) => {
    setIsLabelsLocked(locked)
    if (locked) {
      setShowLabels(false)
    } else {
      setShowLabels(true)
    }
  }
  const [videoDuration, setVideoDuration] = useState(15)
  const [rotationSpeed, setRotationSpeed] = useState(1)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingProgress, setRecordingProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingText, setProcessingText] = useState('Processing...')
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true)

  /* Active property address (formatted from Geocoder) */
  const [activeAddress, setActiveAddress] = useState('')

  /* Realtor branding details */
  const [showBrandingCard, setShowBrandingCard] = useState(false)
  const [realtorName, setRealtorName] = useState('Sarah Jenkins')
  const [realtorPhone, setRealtorPhone] = useState('(555) 019-2834')
  const [realtorPhoto, setRealtorPhoto] = useState<string | null>(null)

  const [realtorPhotoImg, setRealtorPhotoImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (realtorPhoto) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = realtorPhoto
      img.onload = () => {
        setRealtorPhotoImg(img)
      }
      img.onerror = () => {
        // Fallback for data URIs or local assets where crossOrigin might fail
        const imgFallback = new Image()
        imgFallback.src = realtorPhoto
        imgFallback.onload = () => {
          setRealtorPhotoImg(imgFallback)
        }
      }
    } else {
      setRealtorPhotoImg(null)
    }
  }, [realtorPhoto])

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setRealtorPhoto(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  async function handleGenerate() {
    const query = address.trim()
    if (!query || loading) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          query,
        )}&key=${GOOGLE_API_KEY}`
      )
      const data = await res.json()
      const result = data?.results?.[0]

      if (!result) {
        setError('No location found for that address. Try another.')
        setLoading(false)
        return
      }

      const { lat, lng } = result.geometry.location

      // Fade out hero UI + start flying simultaneously
      setIsSearched(true)
      setIsLeftPanelVisible(true)

      const formatted = result.formatted_address || query
      setActiveAddress(formatted)

      globeRef.current?.flyTo(lng, lat, () => {
        setLoading(false)
        setIsAutoRotating(true)
      }, formatted)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function handleBack() {
    setIsSearched(false)
    setLoading(false)
    setError(null)
    setIsLeftPanelVisible(true)
    setIsUiHidden(false)
    setActiveStep(1)
    if (heroOverlayRef.current) {
      heroOverlayRef.current.scrollTop = 0
    }
    
    // Hard reset drawing states
    setPoints([])
    setFuture([])
    setIsDrawing(false)
    setIsMouseOnMap(false)
    setIsAutoRotating(true)
    globeRef.current?.resetToGlobe()
  }

  /* Drawing actions (React model state handlers) */
  const handleMapClick = (coord: { lat: number; lng: number }) => {
    if (!isDrawing) return
    setPoints(prev => [...prev, coord])
    setFuture([]) // YENİ TIKLAMADA REDO SIFIRLANIR
  }

  const handleUndo = () => {
    if (points.length === 0) return
    const lastPoint = points[points.length - 1]
    setPoints(points.slice(0, -1))
    setFuture(prev => [...prev, lastPoint])
  }

  const handleRedo = () => {
    if (future.length === 0) return
    const nextPoint = future[future.length - 1]
    setFuture(prev => prev.slice(0, -1))
    setPoints(prev => [...prev, nextPoint])
  }

  const handleClearDrawing = () => {
    setPoints([])
    setFuture([])
    setIsDrawing(false)
    setIsMouseOnMap(false)
    setIsAutoRotating(false)
  }

  const handleStartDrawing = () => {
    setIsDrawing(true)
  }

  const handleDoneDrawing = () => {
    setIsDrawing(false)
    setIsMouseOnMap(false)
    setIsAutoRotating(false)
    if (points.length > 0) {
      const center = getCentroidOfCoords(points)
      if (center) {
        globeRef.current?.setOrbitCenter(center)
      }
    }
  }

  const handleToggleRotation = () => {
    if (globeRef.current) {
      const state = globeRef.current.toggleRotation()
      setIsAutoRotating(state)
    }
  }

  /* Camera adjust handlers */
  const handleRange = (zoomIn: boolean) => globeRef.current?.adjustRange(zoomIn)
  const handlePan = (dir: 'up' | 'down' | 'left' | 'right') => globeRef.current?.panCenter(dir)
  const handleTilt = (tiltUp: boolean) => globeRef.current?.adjustTilt(tiltUp)
  const handleHeading = (cw: boolean) => globeRef.current?.adjustHeading(cw)
  const handleCompass = () => globeRef.current?.resetCompass()
  const handleGenerateVideo = async () => {
    if (isRecording) return
    setIsRecording(true)
    setIsUiHidden(true) // Hide all UI panels (Presentation/Clean view mode)
    setRecordingProgress(0)
    setProcessingText('Preparing Cinematic HD Render... (Sharpening Textures)')
    setIsProcessing(true) // Show the preparing warm-up screen
    setIsLeftPanelVisible(false) // Hide the left panel completely

    // Start rotation immediately so WebGL updates its buffers
    setRotationSpeed(1)
    if (globeRef.current && !globeRef.current.isAutoRotating()) {
      const state = globeRef.current.toggleRotation()
      setIsAutoRotating(state)
    }

    // Give a 300ms break for DOM layout transitions (hiding panels) to fully settle and resize
    await new Promise((resolve) => setTimeout(resolve, 300))

    // NOW that the map is 100% full screen, force Cesium to resize and enter Ultra HD mode
    globeRef.current?.resize()
    globeRef.current?.setUltraHDMode(true)

    // Wait 1700ms more to let 3D buildings load fully in high quality (2 seconds total warm-up)
    await new Promise((resolve) => setTimeout(resolve, 1700))

    // Remove the warm-up overlay and start the MediaRecorder immediately
    setIsProcessing(false)

    let isRecordingActive = true

    try {
      // 1. Aggressive Canvas Search
      const findCanvas = (): HTMLCanvasElement | null => {
        // Method A: Check MapContainer
        let c = document.querySelector('#mapContainer canvas') as HTMLCanvasElement | null
        if (c) return c

        // Method B: Query general canvas
        c = document.querySelector('canvas') as HTMLCanvasElement | null
        if (c) return c

        // Method C: Globe ref getCanvas
        if (globeRef.current) {
          c = globeRef.current.getCanvas()
        }
        return c
      }

      const cesiumCanvas = findCanvas()
      if (!cesiumCanvas) {
        throw new Error("Cesium Canvas element not found in DOM/ShadowDOM")
      }
      console.log("Cesium canvas found for HD recording:", cesiumCanvas)

      // Create memory-resident merger canvas and match dimensions exactly to drawing buffer for raw WebGL pixel sharpness (ensuring even dimensions for encoder stability)
      const mergerCanvas = document.createElement('canvas')
      let renderWidth = (cesiumCanvas as any).drawingBufferWidth
      let renderHeight = (cesiumCanvas as any).drawingBufferHeight
      if (renderWidth % 2 !== 0) renderWidth--
      if (renderHeight % 2 !== 0) renderHeight--
      mergerCanvas.width = renderWidth
      mergerCanvas.height = renderHeight
      const ctx = mergerCanvas.getContext('2d')
      if (!ctx) {
        throw new Error("Failed to get 2D context from merger canvas")
      }

      // Disable image smoothing (anti-blur) so pixels stay crystal clear
      ctx.imageSmoothingEnabled = false

      // requestAnimationFrame Render Loop
      const drawFrame = () => {
        if (!isRecordingActive) return

        try {
          // A) Copy the rotating 3D Cesium map to the merger canvas (full size copy to prevent stretching)
          ctx.drawImage(cesiumCanvas, 0, 0, mergerCanvas.width, mergerCanvas.height)

          // B) If showBrandingCard is true, draw the Realtor branding card statically on top
          if (showBrandingCard) {
            const scale = mergerCanvas.width / cesiumCanvas.clientWidth

            ctx.save()
            // Scale all subsequent drawings to high-resolution backing store coordinates
            ctx.scale(scale, scale)

            const cardWidth = 360
            const cardHeight = 96
            const cardX = 30
            const cardY = (mergerCanvas.height / scale) - cardHeight - 30
            const radius = 12

            // Draw card background container
            ctx.fillStyle = 'rgba(15, 15, 15, 0.95)'
            ctx.strokeStyle = '#A855F7'
            ctx.lineWidth = 2

            ctx.beginPath()
            if (ctx.roundRect) {
              ctx.roundRect(cardX, cardY, cardWidth, cardHeight, radius)
            } else {
              // Fallback for browsers that don't support roundRect natively
              const x = cardX, y = cardY, w = cardWidth, h = cardHeight, r = radius
              ctx.moveTo(x + r, y)
              ctx.lineTo(x + w - r, y)
              ctx.quadraticCurveTo(x + w, y, x + w, y + r)
              ctx.lineTo(x + w, y + h - r)
              ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
              ctx.lineTo(x + r, y + h)
              ctx.quadraticCurveTo(x, y + h, x, y + h - r)
              ctx.lineTo(x, y + r)
              ctx.quadraticCurveTo(x, y, x + r, y)
            }
            ctx.fill()
            ctx.stroke()

            // Draw accent block strip on left edge
            ctx.fillStyle = '#A855F7'
            ctx.beginPath()
            if (ctx.roundRect) {
              ctx.roundRect(cardX, cardY, 8, cardHeight, [radius, 0, 0, radius])
            } else {
              const x = cardX, y = cardY, w = 8, h = cardHeight, r = radius
              ctx.moveTo(x + r, y)
              ctx.lineTo(x + w, y)
              ctx.lineTo(x + w, y + h)
              ctx.lineTo(x + r, y + h)
              ctx.quadraticCurveTo(x, y + h, x, y + h - r)
              ctx.lineTo(x, y + r)
              ctx.quadraticCurveTo(x, y, x + r, y)
            }
            ctx.fill()

            let textX = cardX + 25

            // If avatar is available and fully loaded, draw it with perfect center-crop (Aspect Ratio Fix)
            if (realtorPhotoImg && realtorPhotoImg.complete) {
              const avatarSize = 54
              const avatarX = cardX + 20
              const avatarY = cardY + (cardHeight - avatarSize) / 2

              ctx.save()
              ctx.beginPath()
              ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
              ctx.closePath()
              ctx.clip()

              // Calculate center crop from source image to prevent oval distortion
              const imgW = realtorPhotoImg.width
              const imgH = realtorPhotoImg.height
              const minDim = Math.min(imgW, imgH)
              const sx = (imgW - minDim) / 2
              const sy = (imgH - minDim) / 2
              const sWidth = minDim
              const sHeight = minDim

              ctx.drawImage(
                realtorPhotoImg, 
                sx, sy, sWidth, sHeight, 
                avatarX, avatarY, avatarSize, avatarSize
              )
              ctx.restore()

              // Avatar ring
              ctx.strokeStyle = '#A855F7'
              ctx.lineWidth = 1.5
              ctx.beginPath()
              ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
              ctx.stroke()

              textX = cardX + 90
            }

            // Emlakçı Metinlerini Çiz (İsim ve Telefon)
            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 16px Inter, sans-serif'
            ctx.fillText(realtorName || 'Sarah Jenkins', textX, cardY + 38)

            ctx.fillStyle = '#A1A1AA' // Gri alt metin
            ctx.font = '13px Inter, sans-serif'
            ctx.fillText(realtorPhone || '(555) 019-2834', textX, cardY + 63)

            ctx.restore()
          }
        } catch (error) {
          console.error("Render frame error:", error)
        }

        requestAnimationFrame(drawFrame)
      }

      // Start loop
      requestAnimationFrame(drawFrame)

      // Capture stream from merger canvas
      let stream: MediaStream
      try {
        stream = mergerCanvas.captureStream ? mergerCanvas.captureStream(30) : (mergerCanvas as any).captureStream(30)
      } catch (e) {
        console.warn("captureStream(30) failed, trying default captureStream():", e)
        stream = mergerCanvas.captureStream ? mergerCanvas.captureStream() : (mergerCanvas as any).captureStream()
      }

      // Configure codec with fallback and safe 8 Mbps bitrate
      const recordingOptions = { 
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm',
        videoBitsPerSecond: 8000000 // 8 Mbps (Güvenli başlangıç sınırı)
      }

      const mediaRecorder = new MediaRecorder(stream, recordingOptions)
      
      mediaRecorder.onerror = (event) => {
        console.error("Kritik Donanımsal Kayıt Hatası:", (event as any).error)
        alert("MediaRecorder İç Hatası: " + ((event as any).error ? (event as any).error.name : 'Unknown'))
      }
      const chunks: Blob[] = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        console.log("MediaRecorder stopped. Chunks collected:", chunks.length)
        setIsProcessing(true) // Show minimalist "Processing..." text overlay in center

        // Stop the canvas merger render loop
        isRecordingActive = false

        // Restore resolution and error tolerances back to normal to save performance
        globeRef.current?.setUltraHDMode(false)

        // Short timeout for compiling chunks into blob
        setTimeout(() => {
          if (chunks.length === 0) {
            alert("Recording failed: No video data chunks were collected.")
            
            // UI Reset
            setIsProcessing(false)
            setIsRecording(false)
            setIsLeftPanelVisible(true)
            setIsUiHidden(false) // Restore UI panels
            setRecordingProgress(0)
            if (globeRef.current && globeRef.current.isAutoRotating()) {
              const state = globeRef.current.toggleRotation()
              setIsAutoRotating(state)
            }

            // Force Cesium to resize back to 75% container size after panels return
            setTimeout(() => {
              globeRef.current?.resize()
            }, 100)
            return
          }

          const blob = new Blob(chunks, { type: recordingOptions.mimeType })
          const url = URL.createObjectURL(blob)
          
          const a = document.createElement('a')
          a.style.display = 'none'
          a.href = url
          // Force download extension to .mp4 so mobile OS recognizes and plays it directly
          a.download = 'property-tour.mp4'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)

          // UI Reset
          setIsProcessing(false)
          setIsRecording(false)
          setIsLeftPanelVisible(true)
          setIsUiHidden(false) // Restore UI panels
          setRecordingProgress(0)

          if (globeRef.current && globeRef.current.isAutoRotating()) {
            const state = globeRef.current.toggleRotation()
            setIsAutoRotating(state)
          }

          // Force Cesium to resize back to 75% container size after panels return
          setTimeout(() => {
            globeRef.current?.resize()
          }, 100)
        }, 1500)
      }

      // Start the actual recording (collect data every 100ms)
      mediaRecorder.start(100)
      console.log("MediaRecorder started successfully.")

      // Record for selected seconds dynamically
      let elapsedSeconds = 0
      const duration = videoDuration
      const progressInterval = setInterval(() => {
        elapsedSeconds++
        setRecordingProgress(Math.min(100, Math.round((elapsedSeconds / duration) * 100)))
        
        if (elapsedSeconds >= duration) {
          clearInterval(progressInterval)
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop()
          }
        }
      }, 1000)

    } catch (error: any) {
      console.error("CRITICAL RECORDING ERROR:", error)
      alert("MediaRecorder Crash Details: " + (error?.message || String(error)))

      // Stop merger render loop
      isRecordingActive = false

      // Restore resolution and error tolerances back to normal to save performance
      globeRef.current?.setUltraHDMode(false)

      // Instantly restore UI so the app doesn't stay locked
      setIsProcessing(false)
      setIsRecording(false)
      setIsLeftPanelVisible(true)
      setIsUiHidden(false) // Restore UI panels
      setRecordingProgress(0)

      if (globeRef.current && globeRef.current.isAutoRotating()) {
        const state = globeRef.current.toggleRotation()
        setIsAutoRotating(state)
      }

      // Force Cesium to resize back to 75% container size after panels return
      setTimeout(() => {
        globeRef.current?.resize()
      }, 100)
    }
  }

  // Global Space Key Listener to toggle rotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        handleToggleRotation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div
      className="bg-black tracking-[-0.02em] text-white"
      style={{
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'row',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
    >
      {/* ── Navigation ─────────────────────────────── */}
      <Navbar 
        isHidden={isSearched} 
        activeTab={activeTab}
        onItemClick={(item) => {
          if (item === 'Features') {
            if (heroOverlayRef.current) {
              heroOverlayRef.current.scrollTop = 0
            }
          } else if (item === 'How It Works') {
            document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
          } else if (item === 'Pricing') {
            document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
          }
        }}
      />

      {/* Left Column: Side Panel (25% width, visible only when isSearched is true) */}
      {isSearched && isLeftPanelVisible && !isUiHidden && (
        <div 
          style={{
            width: '25%',
            height: '100%',
            backgroundColor: '#121212',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '24px',
            borderRight: '1px solid #222',
            overflowY: 'auto'
          }}
          className="custom-scrollbar text-white z-50 relative animate-fade-in"
          onMouseEnter={() => setIsMouseOnMap(false)} // Prevent drawing guide line calculations on panel hover
        >
          {/* Contents: address, highlights, agent branding */}
          <div className="flex flex-col gap-6">
            {/* Location Details (Top) */}
            <div className="border-b border-white/10 pb-4">
              <span className="text-[10px] uppercase font-bold text-[#9333ea] tracking-wider">Searched Property</span>
              <h2 className="text-xl font-bold text-white leading-tight mt-1">{activeAddress || address || 'No Address Searched'}</h2>
            </div>

            {/* Realtor Branding Section (Middle 2) */}
            <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">Realtor Branding</h3>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[10px] text-white/40 uppercase font-semibold mb-1">Realtor Name</label>
                  <input
                    type="text"
                    value={realtorName}
                    onChange={(e) => setRealtorName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-[#9333ea] focus:bg-white/10 transition-all font-medium focus:ring-1 focus:ring-[#9333ea]"
                    placeholder="Enter Realtor Name"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 uppercase font-semibold mb-1">Realtor Phone</label>
                  <input
                    type="text"
                    value={realtorPhone}
                    onChange={(e) => setRealtorPhone(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-[#9333ea] focus:bg-white/10 transition-all font-medium focus:ring-1 focus:ring-[#9333ea]"
                    placeholder="Enter Realtor Phone"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 uppercase font-semibold mb-1">Realtor Photo</label>
                  <div className="flex items-center gap-4">
                    {/* Avatar Preview */}
                    <div className="w-12 h-12 rounded-full border border-white/20 bg-white/5 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {realtorPhoto ? (
                        <img src={realtorPhoto} alt="Realtor" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-white/30">No Pic</span>
                      )}
                    </div>
                    {/* Upload area */}
                    <label className="flex-1 border border-dashed border-white/20 hover:border-[#9333ea]/60 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/5 hover:bg-white/10">
                      <span className="text-[10px] text-white/60 font-medium">Click to upload photo</span>
                      <span className="text-[8px] text-white/40 mt-0.5">PNG, JPG up to 2MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 border-t border-white/5 pt-3">
                  <input
                    type="checkbox"
                    id="showBrandingCardCheckbox"
                    checked={showBrandingCard}
                    onChange={(e) => setShowBrandingCard(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/5 border-white/10 text-[#A855F7] focus:ring-0 focus:ring-offset-0 focus:outline-none accent-[#A855F7] cursor-pointer"
                  />
                  <label htmlFor="showBrandingCardCheckbox" className="text-[11px] text-white/70 select-none cursor-pointer hover:text-white transition-colors">
                    Include branding card in video
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section (Generate Video duration selector & button) */}
          <div className="mt-6 border-t border-white/10 pt-5">
            {/* Video Duration Selector */}
            <div className="mb-4">
              <label className="block text-[10px] text-white/40 uppercase font-bold tracking-wider mb-2">Video Duration</label>
              <div className="grid grid-cols-4 gap-1 bg-[#181818] p-1 rounded-xl border border-white/5">
                {([5, 10, 15, 30] as const).map((durationVal) => (
                  <button
                    key={durationVal}
                    onClick={() => setVideoDuration(durationVal)}
                    disabled={isRecording}
                    className={`py-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                      videoDuration === durationVal
                        ? 'bg-[#A855F7] text-white shadow-lg shadow-[#A855F7]/25 scale-[1.02]'
                        : 'bg-[#222222] text-white/60 hover:text-white hover:bg-[#A855F7]/30'
                    }`}
                  >
                    {durationVal}s
                  </button>
                ))}
              </div>
            </div>

            <button
              id="generate-video-final-btn"
              onClick={handleGenerateVideo}
              disabled={isRecording}
              className="w-full py-4 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all bg-gradient-to-r from-[#9333ea] via-[#a855f7] to-[#c084fc] hover:from-[#7e22ce] hover:to-[#a855f7] shadow-[0_0_20px_rgba(147,51,234,0.4)] hover:shadow-[0_0_35px_rgba(147,51,234,0.8)] hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
            >
              {isRecording ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Recording... {recordingProgress}%
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Generate Video
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Right Column: 3D Map (75% when isSearched is true, 100% when false) */}
      <div 
        className="relative h-full transition-all duration-700"
        style={{
          width: isSearched && isLeftPanelVisible && !isUiHidden ? '75%' : '100%',
          height: '100%',
          position: 'relative'
        }}
      >
        {/* 1 · 3D Globe background */}
        <GlobeBackground 
          ref={globeRef} 
          points={points}
          isDrawing={isDrawing}
          isMouseOnMap={isMouseOnMap}
          setIsMouseOnMap={setIsMouseOnMap}
          onMapClick={handleMapClick}
          showLabels={showLabels}
          rotationSpeed={rotationSpeed}
          onLabelsLockChange={handleLabelsLockChange}
        />

        {/* HTML Realtor Branding Card for Normal View (Not recording) */}
        {isSearched && showBrandingCard && !isRecording && (
          <div 
            style={{
              position: 'absolute',
              bottom: '30px',
              left: '30px',
              width: '360px',
              height: '96px',
              backgroundColor: 'rgba(15, 15, 15, 0.95)',
              border: '2px solid #A855F7',
              borderRadius: '12px',
              zIndex: 40,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              pointerEvents: 'none'
            }}
            className="animate-fade-in text-white"
          >
            {/* Purple Accent Strip */}
            <div 
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '8px',
                height: '100%',
                backgroundColor: '#A855F7'
              }}
            />

            {/* Avatar Photo */}
            {realtorPhoto && (
              <div 
                style={{
                  position: 'absolute',
                  left: '20px',
                  top: '21px',
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  border: '1.5px solid #A855F7',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img 
                  src={realtorPhoto} 
                  alt={realtorName || 'Realtor'} 
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              </div>
            )}

            {/* Realtor Name */}
            <div
              style={{
                position: 'absolute',
                left: realtorPhoto ? '90px' : '25px',
                top: '24px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 'bold',
                fontSize: '16px',
                color: '#FFFFFF',
                lineHeight: '1'
              }}
            >
              {realtorName || 'Sarah Jenkins'}
            </div>

            {/* Realtor Phone */}
            <div
              style={{
                position: 'absolute',
                left: realtorPhoto ? '90px' : '25px',
                top: '52px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                color: '#A1A1AA',
                lineHeight: '1'
              }}
            >
              {realtorPhone || '(555) 019-2834'}
            </div>
          </div>
        )}

        {/* Dark overlay — fades out during search view for clear drone view */}
        <div
          className={`pointer-events-none absolute inset-0 z-10 bg-black/40 transition-opacity duration-700 ${
            isSearched ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Presentation Mode Toggle Button (Top Right) */}
        {isSearched && !isRecording && (
          <button
            onClick={() => setIsUiHidden(prev => !prev)}
            onMouseEnter={() => setIsMouseOnMap(false)} // Prevents drawing guide line calculations on button hover
            className={`absolute top-24 right-8 z-[150] p-3 rounded-full border transition-all duration-300 shadow-2xl hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center ${
              isUiHidden
                ? 'bg-[#9333ea] border-[#a855f7] text-white hover:bg-[#a855f7] shadow-[0_0_15px_rgba(147,51,234,0.6)]'
                : 'bg-black/60 border-white/10 text-white/80 hover:text-white hover:bg-black/80 hover:border-white/20'
            }`}
            title={isUiHidden ? "Show Panels" : "Hide Panels"}
            aria-label={isUiHidden ? "Show UI Panels" : "Hide UI Panels"}
          >
            {isUiHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}

        {/* ── Hero overlay content (fades out during search view) ── */}
        <div
          ref={heroOverlayRef}
          className={`absolute inset-0 z-50 transition-opacity duration-700 overflow-y-auto h-full scroll-smooth custom-scrollbar ${
            isSearched ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Main Hero Screen */}
          <div className="relative w-full h-screen min-h-screen flex-shrink-0">
            {/* 3 · Heading */}
            <div className="absolute top-[14%] left-0 right-0 flex flex-col items-center text-center px-5 pointer-events-none">
              {/* Spotlight Shadow Effect */}
              <div 
                style={{
                  position: 'absolute',
                  top: '-40%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '800px',
                  height: '400px',
                  background: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.16) 0%, rgba(99, 102, 241, 0.08) 35%, rgba(56, 189, 248, 0.03) 60%, rgba(0, 0, 0, 0) 80%)',
                  pointerEvents: 'none',
                  zIndex: 0,
                  filter: 'blur(40px)'
                }}
                className="hero-anim hero-fade"
              />

              <h1 className="leading-[0.95] relative z-10 filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.75)]">
                <span
                  className="block font-jakarta font-black text-5xl sm:text-7xl md:text-8xl hero-anim hero-reveal tracking-tighter bg-gradient-to-b from-white to-zinc-200 bg-clip-text text-transparent px-4 py-2 overflow-visible"
                  style={{ letterSpacing: '-0.05em', animationDelay: '0.25s' }}
                >
                  See every property
                </span>
                <span
                  className="block font-jakarta font-black text-5xl sm:text-7xl md:text-8xl -mt-4 hero-anim hero-reveal tracking-tighter bg-gradient-to-r from-indigo-300 via-purple-400 to-indigo-400 bg-clip-text text-transparent filter drop-shadow-md px-4 py-2 overflow-visible"
                  style={{ letterSpacing: '-0.05em', animationDelay: '0.42s' }}
                >
                  from above.
                </span>
              </h1>
            </div>

            {/* 4 · Center search bar */}
            <div
              className="absolute top-[42%] left-1/2 -translate-x-1/2 w-full max-w-xl px-5 hero-anim hero-fade"
              style={{ animationDelay: '0.6s' }}
            >
              <div className={`relative flex items-center ${searchFocused ? 'pulse-glow' : ''} rounded-full`}>
                <Search className="absolute left-5 text-white/50 w-5 h-5 pointer-events-none" />
                <input
                  id="search-input"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                  placeholder="Enter a US property address..."
                  className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-full pl-13 pr-44 py-4 text-white placeholder-white/50 text-base outline-none focus:border-[#6366f1] focus:bg-white/15 transition-all"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  aria-label="Property address"
                />
                <button
                  id="generate-video-btn"
                  onClick={handleGenerate}
                  disabled={loading}
                  className="absolute right-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white px-6 py-3 rounded-full font-semibold text-sm transition-all hover:scale-[1.03] disabled:opacity-60 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Searching
                    </>
                  ) : (
                    'Search'
                  )}
                </button>
              </div>
              {error && (
                <p className="mt-3 text-sm text-red-300 text-center" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* 5 · Bottom-left paragraph */}
            <div
              className="hidden sm:block absolute bottom-14 left-10 md:left-14 max-w-[260px] hero-anim hero-fade"
              style={{ animationDelay: '0.7s' }}
            >
              <p className="text-sm text-white/60 leading-relaxed">
                VirtualRealty instantly generates cinematic aerial videos of any US
                property, complete with parcel boundaries and AI-powered
                neighborhood analysis.
              </p>
            </div>

            {/* 6 · Bottom-right block */}
            <div
              className="absolute bottom-10 sm:bottom-24 left-5 right-5 sm:left-auto sm:right-10 md:right-14 max-w-full sm:max-w-[260px] flex flex-col items-start gap-4 hero-anim hero-fade"
              style={{ animationDelay: '0.85s' }}
            >
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Trusted by real estate agents across the United States to close
                deals faster with immersive property previews.
              </p>
              <button
                id="watch-demo-btn"
                className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium px-7 py-3 rounded-full transition-all hover:scale-[1.03]"
              >
                Watch Demo
              </button>
            </div>
          </div>

          {/* How It Works Section */}
          <section id="how-it-works" className="relative w-full min-h-screen bg-gradient-to-b from-transparent via-zinc-950 to-black pt-40 text-white px-8 md:px-24 pb-20 z-10">
            {/* Ambient Glow Backdrops */}
            <div className="absolute -left-10 top-1/4 w-[300px] h-[300px] bg-purple-900/10 blur-[130px] rounded-full pointer-events-none" />
            <div className="absolute right-10 top-1/3 w-[400px] h-[400px] bg-indigo-900/15 blur-[150px] rounded-full pointer-events-none" />

            <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-16 items-start">
              
              {/* SOL KOLON (Akan Metin Blokları) */}
              <div className="w-full md:w-1/2 flex flex-col gap-32 py-12">
                {/* Step 1 */}
                <div 
                  data-step="1"
                  className={`transition-all duration-700 ease-in-out flex flex-col justify-center min-h-[250px] ${
                    activeStep === 1 ? 'opacity-100 scale-100 animate-fade-in' : 'opacity-30 scale-95'
                  }`}
                >
                  <div className="flex items-center gap-3 text-xs font-bold tracking-[0.2em] text-[#A855F7] mb-4 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
                    01 / LOCATE
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-jakarta font-black tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-200 bg-clip-text text-transparent">
                    Search and Lock
                  </h3>
                  <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-md">
                    Enter any US residential address and watch the system lock onto the property with pinpoint accuracy.
                  </p>
                </div>

                {/* Step 2 */}
                <div 
                  data-step="2"
                  className={`transition-all duration-700 ease-in-out flex flex-col justify-center min-h-[250px] ${
                    activeStep === 2 ? 'opacity-100 scale-100' : 'opacity-30 scale-95'
                  }`}
                >
                  <div className="flex items-center gap-3 text-xs font-bold tracking-[0.2em] text-[#A855F7] mb-4 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
                    02 / DEFINE
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-jakarta font-black tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-200 bg-clip-text text-transparent">
                    Trace Boundaries
                  </h3>
                  <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-md">
                    Use our smart vector tool to trace the exact property boundaries directly on the 3D map canvas.
                  </p>
                </div>

                {/* Step 3 */}
                <div 
                  data-step="3"
                  className={`transition-all duration-700 ease-in-out flex flex-col justify-center min-h-[250px] ${
                    activeStep === 3 ? 'opacity-100 scale-100' : 'opacity-30 scale-95'
                  }`}
                >
                  <div className="flex items-center gap-3 text-xs font-bold tracking-[0.2em] text-[#A855F7] mb-4 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
                    03 / EXPORT
                  </div>
                  <h3 className="text-3xl sm:text-4xl font-jakarta font-black tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-200 bg-clip-text text-transparent">
                    Render and Download
                  </h3>
                  <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-md">
                    Select your video length, preview your premium branding card, and render a flawless 4K cinematic drone tour instantly.
                  </p>
                </div>
              </div>

              {/* SAĞ KOLON (Sabit Duran Lüks Maket Penceresi) */}
              <div className="w-full md:w-1/2 sticky top-32 h-[400px] sm:h-[450px] md:h-[500px] bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.6)] flex-shrink-0">
                
                {/* Background spotlight inside mock window */}
                <div className="absolute inset-0 bg-radial-gradient from-zinc-900/50 via-black to-black opacity-60 pointer-events-none" />

                {/* Slide 1 */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-8 transition-all duration-700 ease-in-out ${
                  activeStep === 1 ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                }`}>
                  <div className="w-full max-w-sm bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                      <span className="text-[10px] text-zinc-500 font-mono ml-2">address_lookup.py</span>
                    </div>
                    <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-full px-4 py-3 text-xs sm:text-sm text-zinc-400">
                      <Search className="w-4 h-4 text-[#A855F7] animate-pulse" />
                      <span>1600 Pennsylvania Ave NW...</span>
                    </div>
                    <div className="h-28 rounded-xl bg-zinc-950/60 border border-zinc-800/50 flex flex-col items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(168,85,247,0.08)_0%,transparent_70%)]" />
                      <div className="w-12 h-12 rounded-full border border-[#A855F7]/30 flex items-center justify-center animate-ping duration-1000" />
                      <div className="absolute w-2.5 h-2.5 rounded-full bg-[#A855F7] shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                      <span className="text-[9px] uppercase font-bold tracking-widest text-[#c084fc] mt-4 z-10">
                        Locking Property Coordinates
                      </span>
                    </div>
                  </div>
                </div>

                {/* Slide 2 */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-8 transition-all duration-700 ease-in-out ${
                  activeStep === 2 ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                }`}>
                  <div className="w-full max-w-sm bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                      </div>
                      <span className="text-[10px] bg-[#A855F7]/20 text-[#c084fc] px-2.5 py-0.5 rounded-full border border-[#A855F7]/30 font-bold uppercase tracking-wider text-[9px]">
                        Vector Tool
                      </span>
                    </div>
                    <div className="h-32 rounded-xl bg-zinc-950/60 border border-zinc-800/50 relative flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]" />
                      <svg className="w-44 h-20 text-[#A855F7]" viewBox="0 0 100 50">
                        <polygon 
                          points="15,10 85,10 75,40 25,40" 
                          fill="rgba(168, 85, 247, 0.12)" 
                          stroke="currentColor" 
                          strokeWidth="1.5"
                          className="animate-draw-path"
                        />
                        <circle cx="15" cy="10" r="2.5" fill="#fff" className="animate-pulse" />
                        <circle cx="85" cy="10" r="2.5" fill="#fff" className="animate-pulse" />
                        <circle cx="75" cy="40" r="2.5" fill="#fff" className="animate-pulse" />
                        <circle cx="25" cy="40" r="2.5" fill="#fff" className="animate-pulse" />
                      </svg>
                      <div className="absolute bottom-2 right-2 text-[8px] text-zinc-500 font-mono bg-zinc-900/60 px-1.5 py-0.5 rounded">
                        Area: 14,250 sq ft
                      </div>
                    </div>
                  </div>
                </div>

                {/* Slide 3 */}
                <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 sm:p-8 transition-all duration-700 ease-in-out ${
                  activeStep === 3 ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                }`}>
                  <div className="w-full max-w-sm bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">exporter.js</span>
                    </div>
                    
                    {/* Simulated Branding Card */}
                    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 flex items-center gap-3 relative overflow-hidden">
                      <div className="w-2 h-full absolute left-0 top-0 bg-[#A855F7]" />
                      <div className="w-9 h-9 rounded-full bg-zinc-850 border border-[#A855F7]/30 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
                        SJ
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-white">Sarah Jenkins</div>
                        <div className="text-[9px] text-zinc-500">(555) 019-2834</div>
                      </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-400">Rendering 4K Cinematic MP4...</span>
                        <span className="font-mono text-[#c084fc] font-bold">85%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-1000"
                          style={{ width: '85%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </section>

          {/* Pricing Section */}
          <section id="pricing" className="relative w-full min-h-screen bg-black text-white px-8 md:px-24 pt-24 pb-40 border-t border-zinc-900/50 overflow-hidden z-10">
            {/* Ambient background light for pricing section */}
            <div className="absolute left-1/3 top-1/4 w-[500px] h-[500px] bg-purple-900/5 blur-[150px] rounded-full pointer-events-none" />

            <div className="max-w-6xl mx-auto text-center mb-16 relative z-10">
              <h2 className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent font-jakarta font-black text-4xl sm:text-5xl tracking-tight mb-4">
                Transparent pricing for high-end production.
              </h2>
              <p className="text-zinc-500 text-base sm:text-lg max-w-2xl mx-auto">
                Choose the perfect plan for your real estate marketing needs. No hidden fees.
              </p>
            </div>

            {/* 3-Tier Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-6xl mx-auto relative z-10">
              {/* Card 1: Starter */}
              <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-8 backdrop-blur-md flex flex-col justify-between hover:border-zinc-700/60 transition-all duration-300 group hover:-translate-y-1">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Starter</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-jakarta font-black text-white">$0</span>
                      <span className="text-sm text-zinc-500">/ Free</span>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Great for beginners looking to test out cinematic drone simulations.
                  </p>
                  <ul className="space-y-3 pt-4 border-t border-zinc-800/60 text-sm text-zinc-400">
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>5 videos per month</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>1080p Export Quality</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>Standard Support</span>
                    </li>
                  </ul>
                </div>
                <button className="w-full py-3 px-6 mt-8 rounded-xl font-bold text-xs uppercase tracking-wider bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer">
                  Get Started
                </button>
              </div>

              {/* Card 2: Professional (Popular) */}
              <div className="bg-zinc-950/60 border border-purple-500/40 rounded-2xl p-8 backdrop-blur-xl relative shadow-[0_0_40px_rgba(168,85,247,0.1)] flex flex-col justify-between hover:border-purple-500/60 transition-all duration-300 hover:-translate-y-1">
                {/* Popular Pill Badge */}
                <div className="absolute top-0 right-8 -translate-y-1/2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-[9px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
                  Most Popular
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-purple-400">Professional</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-jakarta font-black text-white">$49</span>
                      <span className="text-sm text-zinc-500">/ mo</span>
                    </div>
                  </div>
                  <p className="text-sm text-purple-200/60 leading-relaxed">
                    Perfect for active real estate agents looking to branding multiple listings.
                  </p>
                  <ul className="space-y-3 pt-4 border-t border-zinc-800/80 text-sm text-zinc-300">
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Unlimited 4K Videos</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Smart Vector Boundaries</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Custom Branding Cards</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <span>Priority Render Engine</span>
                    </li>
                  </ul>
                </div>
                <button className="w-full py-3.5 px-6 mt-8 rounded-xl font-bold text-xs uppercase tracking-wider text-white transition-all bg-gradient-to-r from-[#9333ea] to-[#a855f7] hover:from-[#7e22ce] hover:to-[#9333ea] shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 cursor-pointer">
                  Upgrade to Pro
                </button>
              </div>

              {/* Card 3: Enterprise */}
              <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-8 backdrop-blur-md flex flex-col justify-between hover:border-zinc-700/60 transition-all duration-300 group hover:-translate-y-1">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Enterprise</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-jakarta font-black text-white">Custom</span>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Designed for large brokerages and team workflows requiring high scale.
                  </p>
                  <ul className="space-y-3 pt-4 border-t border-zinc-800/60 text-sm text-zinc-400">
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>Dedicated Rendering Server</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>API Access & Webhooks</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>Multi-User Team Accounts</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      <span>24/7 Concierge Support</span>
                    </li>
                  </ul>
                </div>
                <button className="w-full py-3 px-6 mt-8 rounded-xl font-bold text-xs uppercase tracking-wider bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer">
                  Contact Sales
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ── Drawing Toolbar (Top Center, Workspace mode only) ── */}
        <div
          className={`absolute top-24 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 ${
            isSearched && isLeftPanelVisible && !isUiHidden
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-4 pointer-events-none'
          }`}
          onMouseEnter={() => setIsMouseOnMap(false)} // Hide preview line when mouse is on toolbar
        >
          <div className="flex items-center gap-2 bg-black/60 border border-white/10 backdrop-blur-md px-4 py-3 rounded-full shadow-2xl">
            {!isDrawing ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleStartDrawing()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-semibold px-4 py-2.5 rounded-full transition-all hover:scale-[1.03]"
              >
                <PenTool className="w-3.5 h-3.5" />
                Draw Boundary
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-purple-200/90 font-medium px-2 animate-pulse">
                  Click on the 3D map to draw...
                </span>
                
                {/* Undo Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handleUndo()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={points.length === 0}
                  className="p-2 bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/5 border border-white/10 text-white rounded-full transition-all active:scale-95"
                  title="Undo last point"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>

                {/* Redo Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handleRedo()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={future.length === 0}
                  className="p-2 bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/5 border border-white/10 text-white rounded-full transition-all active:scale-95"
                  title="Redo point"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>

                {/* Done Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handleDoneDrawing()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold px-4 py-2 rounded-full transition-all hover:scale-[1.03]"
                >
                  <Check className="w-3.5 h-3.5" />
                  Done
                </button>
              </div>
            )}
            
            {(isDrawing || points.length > 0) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleClearDrawing()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-4 py-2 rounded-full transition-all hover:scale-[1.03]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}

            {/* Label Toggle Button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setShowLabels(prev => !prev)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={isButtonDisabled}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all border ${
                isButtonDisabled
                  ? 'opacity-50 cursor-not-allowed bg-white/5 border-white/10 text-white/40 hover:scale-100'
                  : 'hover:scale-[1.03] ' + (showLabels
                      ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300')
              }`}
              title={isButtonDisabled ? "Labels Locked (Too Close)" : showLabels ? "Hide Map Labels" : "Show Map Labels"}
            >
              {showLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showLabels ? 'Labels On' : 'Labels Off'}
            </button>
          </div>
        </div>

        {/* ── Back button (visible only when isSearched is true) ──────── */}
        <div
          className={`absolute bottom-8 left-8 z-[100] transition-all duration-500 ${
            isSearched && isLeftPanelVisible && !isUiHidden
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
          onMouseEnter={() => setIsMouseOnMap(false)} // Hide preview line when mouse is on back button
        >
          <button
            id="back-btn"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              handleBack()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-2 bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all hover:scale-[1.03]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Floating Camera Control Box (visible only when isSearched is true) */}
        {isSearched && (
          <div 
            style={{
              position: 'absolute',
              bottom: '24px',
              right: '24px',
              zIndex: 50
            }}
            className={`p-5 bg-[#0a0a0f]/90 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col gap-4 text-white shadow-2xl w-64 select-none transition-all duration-500 ${
              !isLeftPanelVisible || isUiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            onMouseEnter={() => setIsMouseOnMap(false)} // Prevent drawing guide line calculations on hover
          >
            {/* Header / Rotation Control */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Camera Control</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleToggleRotation()
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${
                  isAutoRotating 
                    ? 'bg-[#9333ea]/20 border border-[#9333ea]/40 text-[#a855f7]' 
                    : 'bg-white/5 border border-white/10 text-white/60'
                }`}
                title={isAutoRotating ? 'Pause Orbit Rotation' : 'Start Orbit Rotation'}
              >
                {isAutoRotating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {isAutoRotating ? 'Rotating' : 'Paused'}
              </button>
            </div>

            {/* Orbit Speed Selector */}
            <div className="flex flex-col gap-2 border-b border-white/10 pb-3">
              <span className="text-[9px] uppercase font-semibold text-white/40 tracking-wider text-center">Orbit Speed</span>
              <div className="flex items-center justify-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                {([0.5, 1, 2] as const).map((speed) => (
                  <button
                    key={speed}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setRotationSpeed(speed)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`flex-1 py-1 text-[9px] font-bold rounded-md transition-all active:scale-95 ${
                      rotationSpeed === speed
                        ? 'bg-[#9333ea] text-white shadow-md shadow-[#9333ea]/20 scale-[1.02]'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {speed === 0.5 ? '0.5x' : speed === 1 ? '1x' : '2x'}
                  </button>
                ))}
              </div>
            </div>

            {/* D-Pad (Pan) & Compass Grid */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[9px] uppercase font-semibold text-white/40 tracking-wider">Pan Camera</span>
              <div className="relative w-24 h-24 flex items-center justify-center">
                {/* Compass in center */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handleCompass()
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute z-10 w-8 h-8 bg-white/10 hover:bg-[#9333ea]/20 hover:border-[#9333ea]/40 border border-white/20 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 group"
                  title="Align to North"
                >
                  <Compass className="w-3.5 h-3.5 text-white/80 group-hover:text-[#a855f7] transition-colors" />
                </button>

                {/* Arrow Up */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handlePan('up')
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute top-0 w-7 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95"
                  title="Pan Up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>

                {/* Arrow Down */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handlePan('down')
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-0 w-7 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95"
                  title="Pan Down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {/* Arrow Left */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handlePan('left')
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute left-0 w-7 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95"
                  title="Pan Left"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Arrow Right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    handlePan('right')
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute right-0 w-7 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95"
                  title="Pan Right"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Adjustments (Tilt, Zoom) */}
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
              {/* Zoom (+ / -) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase font-semibold text-white/40 tracking-wider text-center">Zoom</span>
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleRange(true)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-8 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95"
                    title="Zoom In"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleRange(false)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-8 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95"
                    title="Zoom Out"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Tilt (Up / Down) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase font-semibold text-white/40 tracking-wider text-center">Tilt</span>
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleTilt(true)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-8 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95 text-[9px] font-bold"
                    title="Tilt Up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleTilt(false)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-8 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95 text-[9px] font-bold"
                    title="Tilt Down"
                  >
                    ▼
                  </button>
                </div>
              </div>

              {/* Manual Rotation (Left / Right) */}
              <div className="flex flex-col gap-1.5 col-span-2">
                <span className="text-[9px] uppercase font-semibold text-white/40 tracking-wider text-center">Heading rotation</span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleHeading(false)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex-1 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95 gap-1 text-[9px]"
                    title="Rotate Left"
                  >
                    ↺ Left
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleHeading(true)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex-1 h-7 bg-white/5 hover:bg-white/15 rounded-lg flex items-center justify-center border border-white/10 hover:scale-105 active:scale-95 gap-1 text-[9px]"
                    title="Rotate Right"
                  >
                    Right ↻
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
      
      {isProcessing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85">
          <div className="text-center">
            <h3 className="text-2xl font-semibold text-white tracking-widest animate-pulse uppercase">{processingText}</h3>
          </div>
        </div>
      )}
    </div>
  )
}
