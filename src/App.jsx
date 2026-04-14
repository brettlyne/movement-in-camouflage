import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useCreateStore, LevaPanel } from 'leva'
import { POVScene, POV_CONTROL_DEFAULTS } from './components/POVScene'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import './App.css'

const PRESETS = [
  {
    title: 'Bouncing Cube',
    values: { strokeThickness: 0.05 },
  },
  {
    title: 'Tetrahedron in Camouflage',
    values: {
      pixelSize: 2,
      rotationSpeed: 3,
      speedX: 1.7,
      speedY: 2.7,
      shapeMode: 'tetrahedron wireframe',
      shapeSize: 4.0,
      strokeThickness: 0.4,
      background: 'camouflage',
    },
  },
  {
    title: 'Arrow Follows Your Cursor',
    description: 'Move your cursor around the page to see the effect.',
    values: {
      pixelSize: 8,
      followCursor: true,
      shapeMode: 'arrow',
      shapeSize: 2,
    },
  },
  {
    title: 'Inverted Circle on Lines',
    values: {
      pixelSize: 24,
      speedX: 1.5,
      speedY: 1.9,
      shapeMode: 'sphere',
      shapeSize: 2.5,
      background: 'lines',
    },
  },
  {
    title: 'Rainbow Donut',
    values: {
      pixelSize: 6,
      speedX: 2,
      speedY: 1.5,
      rotationSpeed: 3.5,
      shapeMode: 'torus',
      shapeSize: 3,
      experimentColorBuffersEnabled: true,
    },
  },
]

/** Stable ref so Leva does not re-apply `titleBar.position` on every parent re-render (e.g. preset changes). */
const LEVA_TITLE_BAR = { position: { x: 0, y: 80 } }

function App() {
  const levaStore = useCreateStore()
  const containerRef = useRef(null)
  /** `null` = not measured yet; `'-1'` = resizing (canvas unmounted); otherwise `${w}x${h}` */
  const [canvasKey, setCanvasKey] = useState(null)
  const lastCommittedRef = useRef({ w: 0, h: 0 })
  const hasInitialSettleRef = useRef(false)
  const settleTimerRef = useRef(null)

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const [presetIndex, setPresetIndex] = useState(0)
  const [photosensitivityOpen, setPhotosensitivityOpen] = useState(true)
  const [sceneStarted, setSceneStarted] = useState(false)

  const applyPresetIndex = useCallback(
    (index) => {
      const preset = PRESETS[index]
      if (!preset) return
      setPresetIndex(index)
      const run = () => {
        levaStore.set({ ...POV_CONTROL_DEFAULTS, ...preset.values }, false)
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(run)
      })
    },
    [levaStore]
  )

  useEffect(() => {
    applyPresetIndex(presetIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial Leva sync (carousel used onSelect on mount)
  }, [])

  useEffect(() => {
    if (!canvasKey || canvasKey === '-1') return
    applyPresetIndex(presetIndex)
  }, [canvasKey, presetIndex, applyPresetIndex])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr || cr.width < 1 || cr.height < 1) return
      const w = Math.round(cr.width)
      const h = Math.round(cr.height)
      const { w: cw, h: ch } = lastCommittedRef.current

      if (!hasInitialSettleRef.current) {
        hasInitialSettleRef.current = true
        lastCommittedRef.current = { w, h }
        setCanvasKey(`${w}x${h}`)
        return
      }

      const sameAsCommitted = w === cw && h === ch
      // If size matches committed and we're not mid-debounce, ignore duplicate RO events.
      if (sameAsCommitted && settleTimerRef.current == null) return

      setCanvasKey('-1')
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current)
      }
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null
        lastCommittedRef.current = { w, h }
        setCanvasKey(`${w}x${h}`)
      }, 500)
    })

    ro.observe(el)
    return () => {
      ro.disconnect()
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current)
      }
    }
  }, [])

  return (
    <>
      <Dialog
        open={photosensitivityOpen}
        onOpenChange={(open) => {
          if (open) setPhotosensitivityOpen(true)
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
          }}
        >
          <DialogContent
            className="sm:max-w-[425px]"
            showCloseButton={false}
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Photosensitivity Warning</DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-left leading-relaxed">
              Some settings can produce flickering pixels or strong motion. If
              you feel discomfort, click anywhere on the scene to pause.
            </DialogDescription>
            <DialogFooter>
              <Button
                type="button"
                variant="neutral"
                onClick={() => {
                  setPhotosensitivityOpen(false)
                  setSceneStarted(true)
                }}
              >
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </form>
      </Dialog>
      <LevaPanel
        store={levaStore}
        hidden={!showAdvanced}
        titleBar={LEVA_TITLE_BAR}
      />
      <div
        ref={containerRef}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          overflow: 'hidden',
        }}
      >
        <Card
          className={`absolute right-4 top-4 z-10 w-88 pointer-events-auto bg-main p-5 px-1`}
        >
          <CardHeader className={panelExpanded ? 'space-y-2' : 'gap-0'}>
            <CardTitle className="pe-14">Motion in Camouflage</CardTitle>
            {panelExpanded ? (
              <CardDescription className="text-muted-foreground leading-relaxed">
                This demo shows the effect of movement within camouflage. Click
                anywhere to pause the animation and the shape will disappear
                (not true for the last 2 experimental presets). I saw a
                similar demo to this and thought it would be fun to be able to try
                some different interactions and settings.
              </CardDescription>
            ) : null}
          </CardHeader>
          {panelExpanded ? (
            <CardContent className="space-y-4">
              <div
                className="flex w-full flex-col gap-2"
                role="group"
                aria-label="Presets"
              >
                {PRESETS.map((preset, i) => (
                  <div key={preset.title} className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="neutral"
                      size="sm"
                      className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal py-2 text-left"
                      aria-pressed={presetIndex === i}
                      onClick={() => applyPresetIndex(i)}
                    >
                      <span
                        className="min-w-6 shrink-0 text-center text-base leading-snug"
                        aria-hidden
                      >
                        {presetIndex === i ? '✅' : ''}
                      </span>
                      <span className="flex-1 text-left">{preset.title}</span>
                    </Button>
                    {preset.description && presetIndex === i ? (
                      <p className="text-xs leading-snug text-muted-foreground">
                        {preset.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant={showAdvanced ? 'neutral' : 'default'}
                size="sm"
                className="w-fit"
                onClick={() => {
                  setShowAdvanced((prev) => {
                    const next = !prev
                    if (next) setPanelExpanded(false)
                    return next
                  })
                }}
              >
                {showAdvanced ? 'Hide advanced controls' : 'Advanced controls'}
              </Button>
            </CardContent>
          ) : null}
          <Button
            type="button"
            // variant="neutral"
            size="icon"
            className="absolute right-2 top-2 z-1 size-9 shrink-0 rounded-full"
            aria-expanded={panelExpanded}
            aria-label={panelExpanded ? 'Minimize panel' : 'Expand panel'}
            onClick={() => setPanelExpanded((v) => !v)}
          >
            {panelExpanded ? (
              <ChevronsDownUp className="size-4" />
            ) : (
              <ChevronsUpDown className="size-4" />
            )}
          </Button>
        </Card>
   
        {sceneStarted && canvasKey && canvasKey !== '-1' ? (
          <Canvas
            key={canvasKey}
            style={{ width: '100%', height: '100%' }}
            dpr={[1, 2]}
            resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
          >
            <POVScene levaStore={levaStore} />
          </Canvas>
        ) : null}
      </div>
    </>
  )
}

export default App
