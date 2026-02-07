import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface TopTransactionsTableProps {
  data: Array<{ id: number; date: string; description: string; amount: number; type: string; category: string | null }>
}

export function TopTransactionsTable({ data }: TopTransactionsTableProps) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Top Transactions</h3>
      {data.length === 0 ? (
        <p className="text-center text-gray-400 py-8">No data</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(txn => (
              <TableRow key={txn.id}>
                <TableCell className="text-sm">{txn.date}</TableCell>
                <TableCell className="text-sm">{txn.description}</TableCell>
                <TableCell className="text-sm text-gray-500">{txn.category ?? 'Uncategorized'}</TableCell>
                <TableCell className={`text-sm text-right ${txn.type === 'credit' ? 'text-green-600' : ''}`}>
                  {txn.type === 'credit' ? '+' : '-'}${txn.amount.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
