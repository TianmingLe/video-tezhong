export type KnowledgeItem = {
  id: string
  title: string
  tags: string[]
  lastUsed: number
  relatedRuns: string[]
  preset: { script: 'mock_device.py' | 'firmware_build.py' | 'e2e_test.py'; scenario: string }
}

export const mockKnowledge: KnowledgeItem[] = [
  {
    id: 'kb-001',
    title: '设备正常启动链路',
    tags: ['device', 'smoke'],
    lastUsed: Date.now() - 86400_000,
    relatedRuns: [],
    preset: { script: 'mock_device.py', scenario: 'normal' }
  },
  {
    id: 'kb-002',
    title: '异常恢复用例',
    tags: ['device', 'error'],
    lastUsed: Date.now() - 3600_000,
    relatedRuns: [],
    preset: { script: 'mock_device.py', scenario: 'spam' }
  }
]

