export type ActivityKind =
  | 'subscription_added'
  | 'subscription_updated'
  | 'subscription_status'
  | 'subscription_deleted'
  | 'subscription_payment'
  | 'policy_added'
  | 'policy_updated'
  | 'policy_status'
  | 'policy_renewed'
  | 'policy_deleted'
  | 'policy_payment'

/** Stored at users/{uid}/activity/{id}. A short, human-readable record of a change. */
export interface ActivityEntry {
  id: string
  kind: ActivityKind
  message: string
  relatedType: 'subscription' | 'policy'
  /** Null when the record no longer exists (e.g. it was deleted). */
  relatedId: string | null
  createdAt: string
}

export type ActivityInput = Pick<ActivityEntry, 'kind' | 'message' | 'relatedType' | 'relatedId'>
