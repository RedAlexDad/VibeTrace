import { useEffect, useRef, type ReactNode } from 'react'

/** Measures a mounted card's height and reports it back to the windowing logic. */
export default function HeightProbe({
  index,
  onHeight,
  children,
}: {
  index: number
  onHeight: (index: number, height: number) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const h = el.getBoundingClientRect().height
      onHeight(index, Math.round(h))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [index, onHeight])
  return <div ref={ref}>{children}</div>
}