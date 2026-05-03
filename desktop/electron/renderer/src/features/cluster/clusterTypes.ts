export type ClusterBucket = 0 | 1 | 2 | 3

export type ClusterKnowledgePoint = {
  title: string
  content: string
  timestamp: string
}

export type ClusterIndexRow = {
  id: string
  run_id: string
  aweme_id: string
  video_url: string
  source_keyword: string
  tags: string[]
  knowledge_point: ClusterKnowledgePoint
  bucket: ClusterBucket
  bucket_label: string
  reason: string
  cluster_id: string | null
}

export type ClusterGroup = {
  cluster_id: string
  name: string
  description: string
  item_ids: string[]
  importance_rank: number
}

export type VideoBucketRow = {
  run_id: string
  aweme_id: string
  video_url: string
  bucket: ClusterBucket
  bucket_label: string
  counts: { b0: number; b1: number; b2: number; b3: number }
}

export type ClusterResult = {
  stats: {
    success_items: number
    error_items: number
    total_points: number
    used_points: number
    truncated: boolean
    use_llm: boolean
    min_cluster_size: number
    max_knowledge_points: number
  }
  buckets: Record<'0' | '1' | '2' | '3', string[]>
  videos: VideoBucketRow[]
  clusters: ClusterGroup[]
  misc: string[]
}

