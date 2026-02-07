import { Card } from '@/components/ui/card'
import { Tags, SlidersHorizontal } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-sm text-gray-500">App configuration and preferences</p>
      </div>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <Tags className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-600">Category Management</h3>
        </div>
        <p className="text-sm text-gray-400">Add, edit, and organize spending categories. Coming soon.</p>
      </Card>

      <Card className="p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <SlidersHorizontal className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-600">Preferences</h3>
        </div>
        <p className="text-sm text-gray-400">Currency, date format, and display options. Coming soon.</p>
      </Card>
    </div>
  )
}
