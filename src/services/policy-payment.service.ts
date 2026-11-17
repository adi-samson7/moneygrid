import { activityOp } from '@/services/activity.service'
import { COLLECTIONS, PreconditionFailedError, db, deleteOp, setOp, type WriteOp } from '@/services/db'
import { paidNotificationOp } from '@/services/notification.service'
import { getPreferences } from '@/services/preferences.service'
import type { PaymentResolution } from '@/types/payment'
import type { Policy, PolicyPayment } from '@/types/policy'
import { todayISO } from '@/utils/dates'
import { advancePremiumWithinTerm } from '@/utils/policy-rules'

export async function listPolicyPayments(uid: string): Promise<PolicyPayment[]> {
  return db.list<PolicyPayment>(uid, COLLECTIONS.policyPayments)
}

/** The open ("upcoming") premium of a policy, if it has one. */
export async function findOpenPremium(uid: string, policyId: string): Promise<PolicyPayment | null> {
  const payments = await db.where<PolicyPayment>(uid, COLLECTIONS.policyPayments, 'policyId', policyId)
  return payments.find((p) => p.status === 'upcoming') ?? null
}

/**
 * Writes that keep exactly one open premium per policy that is not cancelled and still has a
 * premium due within its term. Paid and skipped payments are history and are never touched.
 */
export function openPremiumOps(existingOpen: PolicyPayment | null, policy: Policy): WriteOp[] {
  if (policy.status !== 'active' || policy.nextPremiumDate === null) {
    return existingOpen ? [deleteOp(COLLECTIONS.policyPayments, existingOpen.id)] : []
  }

  const now = new Date().toISOString()
  const open: PolicyPayment = existingOpen
    ? { ...existingOpen, amountMinor: policy.premiumAmountMinor, currency: policy.currency, dueDate: policy.nextPremiumDate, updatedAt: now }
    : {
        id: crypto.randomUUID(),
        policyId: policy.id,
        amountMinor: policy.premiumAmountMinor,
        currency: policy.currency,
        dueDate: policy.nextPremiumDate,
        paymentDate: null,
        status: 'upcoming',
        notes: '',
        createdAt: now,
        updatedAt: now,
      }
  return [setOp(COLLECTIONS.policyPayments, open)]
}

/**
 * Records a premium as paid or skipped, then moves the policy to its next premium date (if one
 * remains before expiry) and opens that payment. Only an open payment can be resolved, and the
 * commit re-checks that at write time.
 */
export async function resolvePolicyPayment(uid: string, paymentId: string, resolution: PaymentResolution): Promise<void> {
  const payment = await db.get<PolicyPayment>(uid, COLLECTIONS.policyPayments, paymentId)
  if (!payment) throw new Error('Payment not found.')
  if (payment.status !== 'upcoming') throw new Error('This payment has already been recorded.')

  const policy = await db.get<Policy>(uid, COLLECTIONS.policies, payment.policyId)
  const now = new Date().toISOString()
  const paymentDate = resolution.status === 'paid' ? (resolution.paymentDate ?? todayISO()) : null
  const resolved: PolicyPayment = {
    ...payment,
    status: resolution.status,
    paymentDate,
    notes: resolution.notes?.trim() ?? payment.notes,
    updatedAt: now,
  }

  const ops: WriteOp[] = [setOp(COLLECTIONS.policyPayments, resolved)]
  if (policy && policy.status === 'active') {
    const advanced: Policy = {
      ...policy,
      nextPremiumDate: advancePremiumWithinTerm(payment.dueDate, policy.billingCycle, policy.startDate, policy.expiryDate),
      updatedAt: now,
    }
    ops.push(setOp(COLLECTIONS.policies, advanced), ...openPremiumOps(null, advanced))
  }
  if (resolved.status === 'paid' && (await getPreferences(uid)).inAppNotifications) {
    ops.push(
      paidNotificationOp({
        paymentId,
        ownerType: 'policy',
        ownerId: policy?.id ?? null,
        ownerName: policy?.policyName ?? 'policy',
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentDate: paymentDate ?? todayISO(),
      }),
    )
  }
  ops.push(
    activityOp({
      kind: 'policy_payment',
      message: `${resolution.status === 'paid' ? 'Marked as paid' : 'Skipped'}: ${policy?.policyName ?? 'policy'} premium`,
      relatedType: 'policy',
      relatedId: policy?.id ?? null,
    }),
  )

  try {
    await db.commit(uid, ops, [{ collection: COLLECTIONS.policyPayments, id: paymentId, field: 'status', equals: 'upcoming' }])
  } catch (error) {
    if (error instanceof PreconditionFailedError) throw new Error('This payment has already been recorded.')
    throw error
  }
}
