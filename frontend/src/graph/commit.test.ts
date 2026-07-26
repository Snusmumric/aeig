import { describe, it, expect, vi } from 'vitest'
import { commitMutation } from './commit'
import { ApiError } from '../api/client'
import type { ApiClient } from '../api/client'

function clientWith(applyMutations: unknown): ApiClient {
  return { applyMutations } as unknown as ApiClient
}

describe('commitMutation', () => {
  it('returns the new version on success', async () => {
    const client = clientWith(vi.fn().mockResolvedValue({ version: 8 }))
    const res = await commitMutation(client, 'g1', 7, { upsertNodes: [] })
    expect(res).toEqual({ version: 8, conflict: false })
  })

  it('maps 409 to a conflict, keeping the old version', async () => {
    const client = clientWith(vi.fn().mockRejectedValue(new ApiError(409, 'version conflict')))
    const res = await commitMutation(client, 'g1', 7, {})
    expect(res).toEqual({ version: 7, conflict: true })
  })

  it('rethrows non-409 errors', async () => {
    const client = clientWith(vi.fn().mockRejectedValue(new ApiError(500, 'boom')))
    await expect(commitMutation(client, 'g1', 7, {})).rejects.toBeInstanceOf(ApiError)
  })
})
