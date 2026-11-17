import type { PaymentRecord, PaymentStatus } from '@/types/payment'
import { todayISO } from './dates'

/** An unpaid payment past its due date is shown as overdue; the stored status stays "upcoming". */
export function effectivePaymentStatus(
  payment: Pick<PaymentRecord, 'status' | 'dueDate'>,
  today: string = todayISO(),
): PaymentStatus {
  return payment.status === 'upcoming' && payment.dueDate < today ? 'overdue' : payment.status
}
