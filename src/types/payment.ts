/**
 * "overdue" is never stored: it is derived from an "upcoming" payment whose due date has passed,
 * so the app never assumes a payment was made just because the date went by.
 */
export type PaymentStatus = 'upcoming' | 'paid' | 'overdue' | 'skipped'

/** Fields shared by subscription payments and policy premium payments (kept in separate collections). */
export interface PaymentRecord {
  id: string
  amountMinor: number
  currency: string
  dueDate: string
  paymentDate: string | null
  /** Only "upcoming", "paid" or "skipped" are persisted. */
  status: PaymentStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface PaymentResolution {
  status: 'paid' | 'skipped'
  /** Required when paid; ignored when skipped. */
  paymentDate?: string
  notes?: string
}
