import { KnowledgeList } from '../features/kb/KnowledgeList'

export function KnowledgeBasePage() {
  return (
    <div className="page">
      <h1 className="page-title">知识库</h1>
      <p className="page-subtitle">本地 Mock（可搜索/点击预填任务配置）。</p>
      <div style={{ marginTop: 16 }}>
        <KnowledgeList />
      </div>
    </div>
  )
}
