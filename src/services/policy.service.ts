import { activityOp } from '@/services/activity.service'
import { COLLECTIONS, db, deleteOp, setOp, type WriteOp } from '@/services/db'
import { findOpenPremium, openPremiumOps } from '@/services/policy-payment.service'
import type { Policy, PolicyInput, PolicyPayment, PolicyStoredStatus, PolicyUpdate, RenewalInput } from '@/types/policy'
import { addDaysISO, todayISO } from '@/utils/dates'
import { nextPremiumWithinTerm } from '@/utils/policy-rules'

const resolveNextPremium = (input: Pick<PolicyInput, 'nextPremiumDate' | 'startDate' | 'billingCycle' | 'expiryDate'>) =>
  input.nextPremiumDate || nextPremiumWithinTerm(input.startDate, input.billingCycle, input.expiryDate)

async function requirePolicy(uid: string, id: string): Promise<Policy> {
  const policy = await db.get<Policy>(uid, COLLECTIONS.policies, id)
  if (!policy) throw new Error('Policy not found.')
  return policy
}

export async function listPolicies(uid: string): Promise<Policy[]> {
  return db.list<Policy>(uid, COLLECTIONS.policies)
}

export async function createPolicy(uid: string, input: PolicyInput): Promise<Policy> {
  const now = new Date().toISOString()
  const policy: Policy = {
    ...input,
    id: crypto.randomUUID(),
    nextPremiumDate: resolveNextPremium(input),
    status: 'active',
    renewals: [],
    createdAt: now,
    updatedAt: now,
  }
  // The policy, its open premium and the activity entry are saved together or not at all.
  await db.commit(uid, [
    setOp(COLLECTIONS.policies, policy),
    ...openPremiumOps(null, policy),
    activityOp({ kind: 'policy_added', message: `Added policy ${policy.policyName}`, relatedType: 'policy', relatedId: policy.id }),
  ])
  return policy
}

export async function updatePolicy(uid: string, id: string, update: PolicyUpdate): Promise<Policy> {
  const existing = await requirePolicy(uid, id)

  let updated: Policy = {
    ...existing,
    ...update,
    nextPremiumDate: resolveNextPremium(update),
    updatedAt: new Date().toISOString(),
  }
  // Reactivating a cancelled policy: skip premium dates missed while it was cancelled.
  if (updated.status === 'active' && existing.status === 'cancelled' && !update.nextPremiumDate) {
    updated = { ...updated, nextPremiumDate: nextPremiumWithinTerm(updated.startDate, updated.billingCycle, updated.expiryDate) }
  }
  await db.commit(uid, [
    setOp(COLLECTIONS.policies, updated),
    ...openPremiumOps(await findOpenPremium(uid, id), updated),
    activityOp({ kind: 'policy_updated', message: `Updated policy ${updated.policyName}`, relatedType: 'policy', relatedId: id }),
  ])
  return updated
}

/** Cancel or reactivate. History is kept; only the open premium is removed or recreated. */
export async function setPolicyStatus(uid: string, id: string, status: PolicyStoredStatus): Promise<Policy> {
  const existing = await requirePolicy(uid, id)

  let updated: Policy = { ...existing, status, updatedAt: new Date().toISOString() }
  if (status === 'active' && existing.status === 'cancelled') {
    updated = {
      ...updated,
      nextPremiumDate: nextPremiumWithinTerm(updated.startDate, updated.billingCycle, updated.expiryDate),
    }
  }
  const ops = [setOp(COLLECTIONS.policies, updated), ...openPremiumOps(await findOpenPremium(uid, id), updated)]
  if (status !== existing.status) {
    ops.push(
      activityOp({
        kind: 'policy_status',
        message: `${status === 'cancelled' ? 'Cancelled' : 'Reactivated'} policy ${updated.policyName}`,
        relatedType: 'policy',
        relatedId: id,
      }),
    )
  }
  await db.commit(uid, ops)
  return updated
}

/** Extends the policy term and records a renewal. Cancelled policies cannot be renewed. */
export async function renewPolicy(uid: string, id: string, renewal: RenewalInput): Promise<Policy> {
  const existing = await requirePolicy(uid, id)
  if (existing.status === 'cancelled') throw new Error('A cancelled policy cannot be renewed. Reactivate it first.')
  if (renewal.newExpiryDate <= existing.expiryDate) throw new Error('The new expiry date must be after the current one.')

  const today = todayISO()
  const now = new Date().toISOString()
  // Premiums resume the day after the old term ended (or today, if that has already passed).
  const resumeFrom = today > existing.expiryDate ? today : addDaysISO(existing.expiryDate, 1)
  const updated: Policy = {
    ...existing,
    expiryDate: renewal.newExpiryDate,
    premiumAmountMinor: renewal.premiumAmountMinor,
    coverageAmountMinor: renewal.coverageAmountMinor,
    // An open premium from the old term stays; otherwise start the new term's schedule.
    nextPremiumDate:
      existing.nextPremiumDate ??
      nextPremiumWithinTerm(existing.startDate, existing.billingCycle, renewal.newExpiryDate, resumeFrom),
    renewals: [
      ...existing.renewals,
      {
        id: crypto.randomUUID(),
        previousExpiryDate: existing.expiryDate,
        newExpiryDate: renewal.newExpiryDate,
        premiumAmountMinor: renewal.premiumAmountMinor,
        coverageAmountMinor: renewal.coverageAmountMinor,
        renewedOn: today,
        notes: renewal.notes.trim(),
      },
    ],
    updatedAt: now,
  }
  await db.commit(uid, [
    setOp(COLLECTIONS.policies, updated),
    ...openPremiumOps(await findOpenPremium(uid, id), updated),
    activityOp({ kind: 'policy_renewed', message: `Renewed policy ${updated.policyName}`, relatedType: 'policy', relatedId: id }),
  ])
  return updated
}

/** Deleting removes the policy and its premium history. Cancelling keeps the history instead. */
export async function deletePolicy(uid: string, id: string): Promise<void> {
  const existing = await db.get<Policy>(uid, COLLECTIONS.policies, id)
  const payments = await db.where<PolicyPayment>(uid, COLLECTIONS.policyPayments, 'policyId', id)
  const ops: WriteOp[] = [...payments.map((p) => deleteOp(COLLECTIONS.policyPayments, p.id)), deleteOp(COLLECTIONS.policies, id)]
  if (existing) {
    ops.push(activityOp({ kind: 'policy_deleted', message: `Deleted policy ${existing.policyName}`, relatedType: 'policy', relatedId: null }))
  }
  await db.commit(uid, ops)
}
