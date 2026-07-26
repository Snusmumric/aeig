import { ApiError, type ApiClient } from '../api/client'
import type { Mutations } from '../api/types'

export interface CommitResult {
  version: number
  conflict: boolean
}

export async function commitMutation(
  client: ApiClient,
  graphId: string,
  version: number,
  m: Mutations,
): Promise<CommitResult> {
  try {
    const r = await client.applyMutations(graphId, version, m)
    return { version: r.version, conflict: false }
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return { version, conflict: true }
    }
    throw e
  }
}

export function newNodeMutation(type: string): Mutations {
  return { upsertNodes: [{ id: crypto.randomUUID(), type, properties: {} }] }
}
