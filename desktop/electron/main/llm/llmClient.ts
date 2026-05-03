export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function createLlmClient(args: {
  fetchImpl?: typeof fetch
  getConfig: () => { apiBaseUrl: string; model: string; apiKey: string } | null
}) {
  const fetchImpl = args.fetchImpl ?? fetch
  const normalizeBase = (s: string) => String(s || '').replace(/\/+$/, '')

  const chatCompletion = async (input: { messages: ChatMessage[]; temperature: number }) => {
    const cfg = args.getConfig()
    if (!cfg) throw new Error('llm config missing')
    const apiBaseUrl = normalizeBase(cfg.apiBaseUrl)
    const url = `${apiBaseUrl}/chat/completions`
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: input.messages, temperature: input.temperature })
    })
    if (!res.ok) throw new Error(`llm http ${res.status}`)
    const json = (await (res as any).json()) as any
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('invalid llm response')
    return content
  }

  return { chatCompletion }
}

