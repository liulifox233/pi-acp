import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hostedActivityTitle,
  hostedActivityToText,
  isHostedActivityComplete,
  toolResultToText
} from '../../src/acp/translate/pi-tools.js'

test('toolResultToText: extracts text from content blocks', () => {
  const text = toolResultToText({
    content: [
      { type: 'text', text: 'hello' },
      { type: 'text', text: ' world' }
    ]
  })
  assert.equal(text, 'hello world')
})

test('toolResultToText: prefers details.diff when present', () => {
  const text = toolResultToText({ details: { diff: '--- a\n+++ b\n' } })
  assert.equal(text, '--- a\n+++ b\n')
})

test('toolResultToText: falls back to JSON', () => {
  const text = toolResultToText({ a: 1 })
  assert.match(text, /"a": 1/)
})

test('toolResultToText: extracts bash stdout/stderr from details', () => {
  const text = toolResultToText({
    details: {
      stdout: 'ok\n',
      stderr: 'warn\n',
      exitCode: 0
    }
  })
  assert.match(text, /ok/)
  assert.match(text, /stderr:/)
  assert.match(text, /warn/)
  assert.match(text, /exit code: 0/)
})

test('hostedActivityTitle: normalizes hosted web search names', () => {
  assert.equal(hostedActivityTitle({ type: 'hostedToolActivity', name: 'web_search_call' }), 'web_search')
  assert.equal(hostedActivityTitle({ type: 'hostedToolActivity', name: 'web_search_tool_result' }), 'web_search')
})

test('hostedActivityToText: formats in-progress web search query', () => {
  const text = hostedActivityToText({
    type: 'hostedToolActivity',
    name: 'web_search_call',
    arguments: { query: 'pi acp' }
  })
  assert.equal(text, 'Searching web for pi acp')
})

test('hostedActivityToText: prefers summary and citations on completion', () => {
  const text = hostedActivityToText({
    type: 'hostedToolActivity',
    name: 'web_search_call',
    status: 'completed',
    summary: 'Hosted web search completed for pi.',
    citations: [{ title: 'pi docs', url: 'https://example.com/docs' }]
  })

  assert.match(text, /Hosted web search completed for pi\./)
  assert.match(text, /Citations: pi docs \(https:\/\/example.com\/docs\)/)
  assert.equal(
    isHostedActivityComplete({
      type: 'hostedToolActivity',
      rawItem: { type: 'web_search_tool_result' }
    }),
    true
  )
})
