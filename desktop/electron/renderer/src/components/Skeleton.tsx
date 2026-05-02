export type SkeletonProps = {
  className?: string
  width?: number | string
  height?: number | string
  style?: React.CSSProperties
}

export function Skeleton(props: SkeletonProps) {
  const width = props.width ?? '100%'
  const height = props.height ?? 14
  return (
    <div
      className={props.className ? `skeleton ${props.className}` : 'skeleton'}
      style={{ width, height, ...props.style }}
    />
  )
}

