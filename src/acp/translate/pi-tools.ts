function stableStringify(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized === undefined ? undefined : serialized
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function trimString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getHostedActivityRawType(activity: unknown): string | undefined {
  return trimString(asRecord(asRecord(activity)?.rawItem)?.type)
}

function getHostedWebSearchQuery(args: unknown): string | undefined {
  const record = asRecord(args)
  if (!record) return undefined

  const directKeys = ['query', 'searchQuery', 'q']
  for (const key of directKeys) {
    const value = trimString(record[key])
    if (value) return value
  }

  const input = asRecord(record.input)
  if (!input) return undefined

  for (const key of directKeys) {
    const value = trimString(input[key])
    if (value) return value
  }

  return undefined
}

function formatHostedCitations(activity: unknown): string[] {
  const citations = asRecord(activity)?.citations
  if (!Array.isArray(citations)) return []

  return citations
    .map((citation, index) => {
      const c = asRecord(citation)
      const title = trimString(c?.title)
      const url = trimString(c?.url)
      const text = trimString(c?.text)
      const label = title ?? url ?? text ?? `citation ${index + 1}`
      return url && url !== label ? `${label} (${url})` : label
    })
    .filter(Boolean)
}

export function isHostedToolActivity(activity: unknown): boolean {
  return asRecord(activity)?.type === 'hostedToolActivity'
}

export function hostedActivityId(activity: unknown): string | undefined {
  return trimString(asRecord(activity)?.id)
}

export function hostedActivityArgs(activity: unknown): Record<string, unknown> | undefined {
  return asRecord(asRecord(activity)?.arguments)
}

export function isHostedWebSearchActivity(activity: unknown): boolean {
  const name = trimString(asRecord(activity)?.name)
  if (name === 'web_search' || name === 'web_search_call' || name === 'web_search_tool_result') {
    return true
  }

  const rawType = getHostedActivityRawType(activity)
  return rawType === 'web_search_call' || rawType === 'web_search_tool_result'
}

export function hostedActivityTitle(activity: unknown): string {
  if (isHostedWebSearchActivity(activity)) return 'web_search'

  const name = trimString(asRecord(activity)?.name) ?? getHostedActivityRawType(activity) ?? 'hosted_tool'
  if (name.endsWith('_tool_result')) return name.slice(0, -'_tool_result'.length)
  if (name.endsWith('_call')) return name.slice(0, -'_call'.length)
  return name
}

export function isHostedActivityComplete(activity: unknown): boolean {
  const status = trimString(asRecord(activity)?.status)
  if (status === 'completed') return true

  const rawType = getHostedActivityRawType(activity)
  return typeof rawType === 'string' && rawType.endsWith('_tool_result')
}

export function hostedActivityToText(activity: unknown): string {
  const record = asRecord(activity)
  if (!record) return ''

  const lines: string[] = []
  const summary = trimString(record.summary)

  if (summary) {
    lines.push(summary)
  } else if (isHostedWebSearchActivity(activity)) {
    const query = getHostedWebSearchQuery(record.arguments)
    if (isHostedActivityComplete(activity)) {
      lines.push(query ? `Web search completed for ${query}` : 'Web search completed')
    } else {
      lines.push(query ? `Searching web for ${query}` : 'Searching web')
    }
  } else {
    const argsText = stableStringify(record.arguments)
    if (argsText && argsText !== '{}') {
      lines.push(`Hosted tool ${hostedActivityTitle(activity)} activity: ${argsText}`)
    }
  }

  const citations = formatHostedCitations(activity)
  if (citations.length > 0) lines.push(`Citations: ${citations.join(', ')}`)

  return lines.join('\n')
}

export function toolNameToKind(toolName: string): 'read' | 'edit' | 'other' {
  switch (toolName) {
    case 'read':
      return 'read'
    case 'write':
    case 'edit':
      return 'edit'
    case 'bash':
      return 'other'
    default:
      return 'other'
  }
}

export function toolResultToText(result: unknown): string {
  if (!result) return ''

  // pi tool results generally look like: { content: [{type:"text", text:"..."}], details: {...} }
  const content = (result as any).content
  if (Array.isArray(content)) {
    const texts = content
      .map((c: any) => (c?.type === 'text' && typeof c.text === 'string' ? c.text : ''))
      .filter(Boolean)
    if (texts.length) return texts.join('')
  }

  const details = (result as any)?.details

  // Some pi tools return a unified diff in `details.diff`.
  const diff = details?.diff
  if (typeof diff === 'string' && diff.trim()) {
    return diff
  }

  // The bash tool frequently returns stdout/stderr in `details` rather than content blocks.
  const stdout =
    (typeof details?.stdout === 'string' ? details.stdout : undefined) ??
    (typeof (result as any)?.stdout === 'string' ? (result as any).stdout : undefined) ??
    (typeof details?.output === 'string' ? details.output : undefined) ??
    (typeof (result as any)?.output === 'string' ? (result as any).output : undefined)

  const stderr =
    (typeof details?.stderr === 'string' ? details.stderr : undefined) ??
    (typeof (result as any)?.stderr === 'string' ? (result as any).stderr : undefined)

  const exitCode =
    (typeof details?.exitCode === 'number' ? details.exitCode : undefined) ??
    (typeof (result as any)?.exitCode === 'number' ? (result as any).exitCode : undefined) ??
    (typeof details?.code === 'number' ? details.code : undefined) ??
    (typeof (result as any)?.code === 'number' ? (result as any).code : undefined)

  if ((typeof stdout === 'string' && stdout.trim()) || (typeof stderr === 'string' && stderr.trim())) {
    const parts: string[] = []
    if (typeof stdout === 'string' && stdout.trim()) parts.push(stdout)
    if (typeof stderr === 'string' && stderr.trim()) parts.push(`stderr:\n${stderr}`)
    if (typeof exitCode === 'number') parts.push(`exit code: ${exitCode}`)
    return parts.join('\n\n').trimEnd()
  }

  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}
