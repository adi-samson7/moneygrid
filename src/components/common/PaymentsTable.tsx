import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PaymentActionDialog } from '@/components/common/PaymentActionDialog'
import { PaymentStatusBadge } from '@/components/subscriptions/StatusBadges'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PaymentRecord, PaymentResolution } from '@/types/payment'
import { formatDisplayDate } from '@/utils/dates'
import { formatMoney } from '@/utils/money'
import { effectivePaymentStatus } from '@/utils/payments'

interface PaymentsTableProps<T extends PaymentRecord> {
  payments: T[]
  /** The id of the subscription or policy a payment belongs to. */
  getOwnerId: (payment: T) => string
  /** Owner names by id, for display. */
  ownerNames: Map<string, string>
  /** Column heading and link target for the owner. */
  ownerLabel: string
  ownerPath: string
  /** Show which owner each payment belongs to (hide on a single record's page). */
  showOwner?: boolean
  /** Show "Mark paid" and "Skip" on open payments. */
  showActions?: boolean
  onResolve: (paymentId: string, resolution: PaymentResolution) => Promise<void>
}

export function PaymentsTable<T extends PaymentRecord>({
  payments,
  getOwnerId,
  ownerNames,
  ownerLabel,
  ownerPath,
  showOwner = true,
  showActions = true,
  onResolve,
}: PaymentsTableProps<T>) {
  const [action, setAction] = useState<{ payment: T; mode: 'paid' | 'skipped' } | null>(null)
  const nameFor = (payment: T) => ownerNames.get(getOwnerId(payment)) ?? 'Unknown'

  return (
    <>
      <div className="glass overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              {showOwner && <TableHead>{ownerLabel}</TableHead>}
              <TableHead>Due date</TableHead>
              <TableHead>Paid on</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              {showActions && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const status = effectivePaymentStatus(payment)
              const isOpen = payment.status === 'upcoming'
              return (
                <TableRow key={payment.id}>
                  {showOwner && (
                    <TableCell className="font-medium">
                      <Link to={`${ownerPath}/${getOwnerId(payment)}`} className="hover:underline">
                        {nameFor(payment)}
                      </Link>
                    </TableCell>
                  )}
                  <TableCell>{formatDisplayDate(payment.dueDate)}</TableCell>
                  <TableCell>{payment.paymentDate ? formatDisplayDate(payment.paymentDate) : '—'}</TableCell>
                  <TableCell>{formatMoney(payment.amountMinor, payment.currency)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={status} />
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground" title={payment.notes}>
                    {payment.notes || '—'}
                  </TableCell>
                  {showActions && (
                    <TableCell className="text-right">
                      {isOpen && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setAction({ payment, mode: 'paid' })}>
                            Mark paid
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAction({ payment, mode: 'skipped' })}>
                            Skip
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <PaymentActionDialog
        payment={action?.payment ?? null}
        mode={action?.mode ?? 'paid'}
        ownerName={action ? nameFor(action.payment) : ''}
        onResolve={onResolve}
        onClose={() => setAction(null)}
      />
    </>
  )
}
