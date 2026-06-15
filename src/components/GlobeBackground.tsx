import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { GOOGLE_API_KEY } from '../lib/google-maps'

/* ──────────────────────────────────────────────────────────
 *  Public API exposed via ref
 * ────────────────────────────────────────────────────────── */

export type GlobeHandle = {
  flyTo: (lng: number, lat: number, onArrive?: () => void, addressTitle?: string) => void
  resetToGlobe: () => void

  // Camera manual controls
  adjustRange: (zoomIn: boolean) => void
  panCenter: (direction: 'up' | 'down' | 'left' | 'right') => void
  adjustTilt: (tiltUp: boolean) => void
  adjustHeading: (clockwise: boolean) => void
  resetCompass: () => void
  toggleRotation: () => boolean
  isAutoRotating: () => boolean

  // Drawing helpers
  setOrbitCenter: (center: { lat: number; lng: number }) => void
  getCanvas: () => HTMLCanvasElement | null
  setResolutionScale: (scale: number) => void
  setUltraHDMode: (enabled: boolean) => void
  resize: () => void
}

export interface GlobeBackgroundProps {
  points: { lat: number; lng: number }[]
  isDrawing: boolean
  isMouseOnMap: boolean
  setIsMouseOnMap: (val: boolean) => void
  onMapClick: (coord: { lat: number; lng: number }) => void
  showLabels: boolean
  rotationSpeed: number
  onLabelsLockChange?: (locked: boolean) => void
}

/* ──────────────────────────────────────────────────────────
 *  Component
 * ────────────────────────────────────────────────────────── */

export const GlobeBackground = forwardRef<GlobeHandle, GlobeBackgroundProps>(
  function GlobeBackground(props, ref) {
    const { 
      points, 
      isDrawing, 
      isMouseOnMap, 
      setIsMouseOnMap, 
      onMapClick, 
      showLabels, 
      rotationSpeed, 
      onLabelsLockChange
    } = props
    
    // Silence unused local variable compiler checks
    if (false as boolean) {
      console.log(isMouseOnMap, setIsMouseOnMap)
    }



    const containerRef = useRef<HTMLDivElement>(null)
    const viewerRef = useRef<Cesium.Viewer | null>(null)
    const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null)
    const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null)

    // Orbit/rotation state refs
    const orbitCenterRef = useRef<{ lat: number; lng: number }>({ lat: 20, lng: 0 })
    const isRotatingRef = useRef<boolean>(true)
    const lastTimeRef = useRef<number>(performance.now())
    const rotationRangeRef = useRef<number>(25000000)


    // Entity references for boundary drawing
    const polygonEntityRef = useRef<Cesium.Entity | null>(null)
    const polylineEntityRef = useRef<Cesium.Entity | null>(null)
    const previewEntityRef = useRef<Cesium.Entity | null>(null)
    const markerEntitiesRef = useRef<Cesium.Entity[]>([])
    const addressPinEntityRef = useRef<Cesium.Entity | null>(null)

    // State tracking Google Maps 3D element loading
    const [mapLoaded, setMapLoaded] = useState(false)

    // Refs to prevent stale closures in event handlers
    const pointsRef = useRef(points)
    const isDrawingRef = useRef(isDrawing)
    const onMapClickRef = useRef(onMapClick)
    const speedRef = useRef(rotationSpeed)

    useEffect(() => {
      pointsRef.current = points
    }, [points])

    useEffect(() => {
      isDrawingRef.current = isDrawing
    }, [isDrawing])

    useEffect(() => {
      onMapClickRef.current = onMapClick
    }, [onMapClick])

    useEffect(() => {
      speedRef.current = rotationSpeed
    }, [rotationSpeed])

    const showLabelsRef = useRef(showLabels)

    useEffect(() => {
      showLabelsRef.current = showLabels
    }, [showLabels])

    const onLabelsLockChangeRef = useRef(onLabelsLockChange)
    useEffect(() => {
      onLabelsLockChangeRef.current = onLabelsLockChange
    }, [onLabelsLockChange])

    /* ── Cesium Initialization ─────────────────────── */
    useEffect(() => {
      if (!containerRef.current) return

      const viewer = new Cesium.Viewer(containerRef.current, {
        terrainProvider: undefined,
        animation: false,
        timeline: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        homeButton: false,
        geocoder: false,
        baseLayerPicker: false,
        infoBox: false,
        selectionIndicator: false,
        contextOptions: {
          webgl: {
            preserveDrawingBuffer: true // Absolutely mandatory for canvas recording
          }
        }
      })
      
      // Ensure mouse wheel zoom remains enabled during all navigation modes
      viewer.scene.screenSpaceCameraController.enableZoom = true
 
      // Hide default bottom copyright credit container
      if (viewer.bottomContainer) {
        (viewer.bottomContainer as HTMLElement).style.display = 'none'
      }

      // Add Google Photorealistic 3D Tileset
      Cesium.Cesium3DTileset.fromUrl(
        `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`
      ).then((tileset) => {
        viewer.scene.primitives.add(tileset)
        tilesetRef.current = tileset
      }).catch((err) => {
        console.error("Failed to load Google 3D Tiles in Cesium:", err)
      })

      viewerRef.current = viewer
      setMapLoaded(true)

      // Start initial slow spin of the globe
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
        orientation: {
          heading: 0.0,
          pitch: Cesium.Math.toRadians(-90.0),
          roll: 0.0
        }
      })

      return () => {
        if (viewerRef.current) {
          viewerRef.current.destroy()
          viewerRef.current = null
        }
        setMapLoaded(false)
      }
    }, [])

    /* ── Expose API via ref ───────────────────────── */
    useImperativeHandle(ref, () => ({
      flyTo: (lng, lat, onArrive, addressTitle) => {
        const viewer = viewerRef.current
        if (!viewer) {
          onArrive?.()
          return
        }

        isRotatingRef.current = false
        orbitCenterRef.current = { lat, lng }

        // Remove old address pin
        if (addressPinEntityRef.current) {
          viewer.entities.remove(addressPinEntityRef.current)
          addressPinEntityRef.current = null
        }

        const svgString = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#A855F7" stroke="#FFFFFF" stroke-width="1.5"/></svg>'

        // Add 3D Adres Pin (clamped to 3D tiles with pixel offset)
        addressPinEntityRef.current = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lng, lat, 0), // Base reference at ground/roof level
          billboard: {
            image: 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            width: 36,
            height: 36,
            heightReference: Cesium.HeightReference.CLAMP_TO_3D_TILE, // Clamps pin to building roof or terrain
            pixelOffset: new Cesium.Cartesian2(0, -40), // Elevates the pin visually above roof
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          label: {
            text: addressTitle || 'Target Property',
            font: 'bold 12px Inter, sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_3D_TILE, // Clamps text to building roof or terrain
            pixelOffset: new Cesium.Cartesian2(0, -85), // Positions text above the billboard pin
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })

        // Apply showLabels state visibility
        addressPinEntityRef.current.show = showLabelsRef.current

        const target = Cesium.Cartesian3.fromDegrees(lng, lat)

        // Pitch of -35 degrees (55 degrees tilt from zenith) at 500m distance
        const offset = new Cesium.HeadingPitchRange(
          viewer.camera.heading,
          Cesium.Math.toRadians(-35),
          500
        )

        viewer.camera.flyToBoundingSphere(
          new Cesium.BoundingSphere(target, 0),
          {
            offset: offset,
            duration: 3.5,
            complete: () => {
              // Reset transform matrix to unlock manual user controls
              viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)

              // Automatically start rotation on arrival
              isRotatingRef.current = true
              rotationRangeRef.current = 500
              lastTimeRef.current = performance.now()

              onArrive?.()
            }
          }
        )
      },

      resetToGlobe: () => {
        const viewer = viewerRef.current
        if (!viewer) return

        isRotatingRef.current = false
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)

        // Remove pin when resetting back to global view
        if (addressPinEntityRef.current) {
          viewer.entities.remove(addressPinEntityRef.current)
          addressPinEntityRef.current = null
        }

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
          orientation: {
            heading: 0.0,
            pitch: Cesium.Math.toRadians(-90.0),
            roll: 0.0
          },
          duration: 2.5,
          complete: () => {
            isRotatingRef.current = true
            rotationRangeRef.current = 25000000
            lastTimeRef.current = performance.now()
          }
        })
      },

      // ─── Camera adjustment methods ───
      adjustRange: (zoomIn) => {
        const viewer = viewerRef.current
        if (!viewer) return
        const camera = viewer.camera
        const cartographicHeight = camera.positionCartographic.height
        const amount = Math.max(5, cartographicHeight * 0.15)
        if (zoomIn) {
          camera.zoomIn(amount)
        } else {
          camera.zoomOut(amount)
        }
      },

      panCenter: (direction) => {
        const viewer = viewerRef.current
        if (!viewer) return
        const camera = viewer.camera
        const cartographicHeight = camera.positionCartographic.height
        const amount = Math.max(2, cartographicHeight * 0.1)

        if (direction === 'up') {
          camera.moveUp(amount)
        } else if (direction === 'down') {
          camera.moveDown(amount)
        } else if (direction === 'left') {
          camera.moveLeft(amount)
        } else if (direction === 'right') {
          camera.moveRight(amount)
        }
      },

      adjustTilt: (tiltUp) => {
        const viewer = viewerRef.current
        if (!viewer) return
        const camera = viewer.camera
        const amount = Cesium.Math.toRadians(5)
        if (tiltUp) {
          camera.lookUp(amount)
        } else {
          camera.lookDown(amount)
        }
      },

      adjustHeading: (clockwise) => {
        const viewer = viewerRef.current
        if (!viewer) return
        const camera = viewer.camera
        const amount = Cesium.Math.toRadians(15)
        if (clockwise) {
          camera.lookRight(amount)
        } else {
          camera.lookLeft(amount)
        }
      },

      resetCompass: () => {
        const viewer = viewerRef.current
        if (!viewer) return
        const camera = viewer.camera
        camera.setView({
          orientation: {
            heading: 0.0,
            pitch: camera.pitch,
            roll: camera.roll
          }
        })
      },

      toggleRotation: () => {
        isRotatingRef.current = !isRotatingRef.current
        if (isRotatingRef.current && viewerRef.current) {
          lastTimeRef.current = performance.now()
          const target = Cesium.Cartesian3.fromDegrees(orbitCenterRef.current.lng, orbitCenterRef.current.lat)
          const distance = Cesium.Cartesian3.distance(viewerRef.current.camera.position, target)
          if (distance > 5 && distance < 30000) {
            rotationRangeRef.current = distance
          } else {
            rotationRangeRef.current = 500
          }
        }
        return isRotatingRef.current
      },

      isAutoRotating: () => {
        return isRotatingRef.current
      },

      setOrbitCenter: (center) => {
        orbitCenterRef.current = center
      },

      getCanvas: () => {
        return viewerRef.current ? viewerRef.current.scene.canvas : null
      },
      setResolutionScale: (scale) => {
        const viewer = viewerRef.current
        if (viewer) {
          viewer.resolutionScale = scale
          viewer.scene.requestRender()
        }
      },
      setUltraHDMode: (enabled) => {
        const viewer = viewerRef.current
        if (viewer) {
          viewer.resize()
          viewer.resolutionScale = enabled ? 1.5 : 1.0
          viewer.scene.globe.maximumScreenSpaceError = enabled ? 1 : 2
          viewer.scene.requestRender()
        }
      },
      resize: () => {
        viewerRef.current?.resize()
      }
    }))

    /* ── Drawing Entities Rendering Sync ──────────── */
    useEffect(() => {
      const viewer = viewerRef.current
      if (!viewer) return

      // Clear previous drawing entities
      if (polygonEntityRef.current) {
        viewer.entities.remove(polygonEntityRef.current)
        polygonEntityRef.current = null
      }
      if (polylineEntityRef.current) {
        viewer.entities.remove(polylineEntityRef.current)
        polylineEntityRef.current = null
      }
      for (const m of markerEntitiesRef.current) {
        viewer.entities.remove(m)
      }
      markerEntitiesRef.current = []

      if (points.length === 0) return

      // Render Polygon if there are enough vertices (>=3)
      if (points.length >= 3) {
        const positions = points.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat))
        polygonEntityRef.current = viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: Cesium.Color.fromCssColorString('rgba(217, 70, 239, 0.25)'),
            classificationType: Cesium.ClassificationType.CESIUM_3D_TILE // Drapes polygon over 3D buildings
          }
        })
      }

      // Render Polyline boundary outline
      if (points.length >= 2) {
        const positions = points.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat))
        // Close polygon outline path if done drawing
        if (!isDrawing && points.length >= 3) {
          positions.push(Cesium.Cartesian3.fromDegrees(points[0].lng, points[0].lat))
        }
        polylineEntityRef.current = viewer.entities.add({
          polyline: {
            positions: positions,
            width: 4.0,
            material: Cesium.Color.fromCssColorString('#d946ef'),
            clampToGround: true,
            classificationType: Cesium.ClassificationType.CESIUM_3D_TILE // Drapes outline over 3D buildings
          }
        })
      }


    }, [points, isDrawing, mapLoaded])

    /* ── Labels Toggle 3D Pin Visibility Sync ─────── */
    useEffect(() => {
      if (addressPinEntityRef.current) {
        addressPinEntityRef.current.show = showLabels
      }
    }, [showLabels])



    /* ── Camera Distance Tracking for Labels Lock ───── */
    useEffect(() => {
      const viewer = viewerRef.current
      if (!viewer) return

      let wasLocked = false

      const checkCamera = () => {
        if (!orbitCenterRef.current) return

        const propertyTargetCartesianPosition = Cesium.Cartesian3.fromDegrees(orbitCenterRef.current.lng, orbitCenterRef.current.lat)
        // Cesium's camera.position is in world coordinates when camera.transform is identity (Matrix4.IDENTITY).
        // If lookAt transform is active, we use camera.positionWC for world coordinates to avoid coordinate mismatch.
        const cameraPos = viewer.camera.transform.equals(Cesium.Matrix4.IDENTITY) 
          ? viewer.camera.position 
          : viewer.camera.positionWC
        const distance = Cesium.Cartesian3.distance(cameraPos, propertyTargetCartesianPosition)

        const isBelowThreshold = distance < 1450.0

        if (isBelowThreshold !== wasLocked) {
          wasLocked = isBelowThreshold
          if (onLabelsLockChangeRef.current) {
            onLabelsLockChangeRef.current(isBelowThreshold)
          }
        }
      }

      viewer.camera.changed.addEventListener(checkCamera)
      viewer.clock.onTick.addEventListener(checkCamera)

      return () => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.camera.changed.removeEventListener(checkCamera)
          viewer.clock.onTick.removeEventListener(checkCamera)
        }
      }
    }, [mapLoaded])

    /* ── Drawing Mouse Inputs Handler ──────────────── */
    useEffect(() => {
      const viewer = viewerRef.current
      if (!viewer) return

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
      handlerRef.current = handler

      // Left Click: Add Point
      handler.setInputAction((click: any) => {
        if (!isDrawingRef.current) return

        // Pick location on 3D tiles or fallback to ellipsoid
        const cartesian = viewer.scene.pickPosition(click.position) || 
                          viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid)
        if (cartesian) {
          const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
          const lng = Cesium.Math.toDegrees(cartographic.longitude)
          const lat = Cesium.Math.toDegrees(cartographic.latitude)
          onMapClickRef.current({ lat, lng })
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      // Mouse Move: Render Preview Line
      handler.setInputAction((movement: any) => {
        if (!isDrawingRef.current || pointsRef.current.length === 0) {
          if (previewEntityRef.current) {
            viewer.entities.remove(previewEntityRef.current)
            previewEntityRef.current = null
          }
          return
        }

        const cartesian = viewer.scene.pickPosition(movement.endPosition) || 
                          viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid)
        if (cartesian) {
          if (previewEntityRef.current) {
            viewer.entities.remove(previewEntityRef.current)
          }

          const startPt = pointsRef.current[pointsRef.current.length - 1]
          const positions = [
            Cesium.Cartesian3.fromDegrees(startPt.lng, startPt.lat),
            cartesian
          ]

          previewEntityRef.current = viewer.entities.add({
            polyline: {
              positions: positions,
              width: 3.0,
              material: Cesium.Color.fromCssColorString('rgba(217, 70, 239, 0.7)'),
              clampToGround: true,
              classificationType: Cesium.ClassificationType.CESIUM_3D_TILE // Drapes preview line over 3D buildings
            }
          })
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

      return () => {
        handler.destroy()
        handlerRef.current = null
      }
    }, [mapLoaded])

    /* ── Camera Orbit Tick Listener ────────────────── */
    useEffect(() => {
      const viewer = viewerRef.current
      if (!viewer) return

      const onTick = () => {
        if (isRotatingRef.current && orbitCenterRef.current) {
          const propertyTargetCartesianPosition = Cesium.Cartesian3.fromDegrees(orbitCenterRef.current.lng, orbitCenterRef.current.lat)
          const transform = Cesium.Transforms.eastNorthUpToFixedFrame(propertyTargetCartesianPosition)
          
          const now = performance.now()
          const delta = (now - lastTimeRef.current) / 1000
          lastTimeRef.current = now

          // Orbit speed: 5 degrees per second * speed ratio
          const headingDelta = Cesium.Math.toRadians(5 * speedRef.current * delta)
          const newHeading = viewer.camera.heading + headingDelta

          // Dynamically read camera position to compute distance in world coordinates.
          // In the first tick (where camera.transform is Matrix4.IDENTITY), camera.position is in world coordinates.
          // Otherwise, we use camera.positionWC to prevent coordinate frame mismatch.
          const cameraPosition = viewer.camera.transform.equals(Cesium.Matrix4.IDENTITY) 
            ? viewer.camera.position 
            : viewer.camera.positionWC;
          const liveRange = Cesium.Cartesian3.distance(cameraPosition, propertyTargetCartesianPosition);
          const currentPitch = viewer.camera.pitch; // Keep current pitch

          // Rotate dynamically with liveRange to keep zoom interactive
          viewer.camera.lookAtTransform(
            transform,
            new Cesium.HeadingPitchRange(newHeading, currentPitch, liveRange)
          )

          // Ensure zoom remains enabled during auto-rotation
          viewer.scene.screenSpaceCameraController.enableZoom = true
        } else {
          // Reset transform matrix to let manual user mouse pan and tilt work
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
          lastTimeRef.current = performance.now()
        }
      }

      viewer.clock.onTick.addEventListener(onTick)
      return () => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.clock.onTick.removeEventListener(onTick)
        }
      }
    }, [mapLoaded])

    return (
      <div 
        aria-hidden="true" 
        className="absolute inset-0 h-full w-full bg-black"
        onMouseEnter={() => setIsMouseOnMap(true)}
        onMouseLeave={() => {
          setIsMouseOnMap(false)
          if (previewEntityRef.current && viewerRef.current) {
            viewerRef.current.entities.remove(previewEntityRef.current)
            previewEntityRef.current = null
          }
        }}
      >
        <div ref={containerRef} id="mapContainer" className="h-full w-full" style={{ width: '100%', height: '100%' }} />
      </div>
    )
  },
)

export default GlobeBackground
