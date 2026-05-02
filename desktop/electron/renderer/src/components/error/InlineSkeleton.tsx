export function InlineSkeleton() {
  const bar = (w: string, h: number) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        background: 'rgba(255,255,255,0.08)'
      }}
    />
  )

  return (
    <div style={{ padding: 28, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {bar('220px', 18)}
      <div style={{ height: 12 }} />
      {bar('60%', 14)}
      <div style={{ height: 10 }} />
      {bar('80%', 14)}
    </div>
  )
}

