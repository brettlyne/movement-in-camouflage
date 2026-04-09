import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { POVScene } from './components/POVScene'
import './App.css'

function App() {
  const containerRef = useRef(null)
  /** `null` = not measured yet; `'-1'` = resizing (canvas unmounted); otherwise `${w}x${h}` */
  const [canvasKey, setCanvasKey] = useState(null)
  const lastCommittedRef = useRef({ w: 0, h: 0 })
  const hasInitialSettleRef = useRef(false)
  const settleTimerRef = useRef(null)

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
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        overflow: 'hidden'
      }}
    >
      {canvasKey && canvasKey !== '-1' ? (
        <Canvas
          key={canvasKey}
          style={{ width: '100%', height: '100%' }}
          dpr={[1, 2]}
          resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        >
          <POVScene />
        </Canvas>
      ) : null}
    </div>
  )
}

export default App
