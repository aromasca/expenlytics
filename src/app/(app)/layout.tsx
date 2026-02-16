import { Sidebar } from '@/components/sidebar'
import { WalkthroughProvider } from '@/components/walkthrough-provider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalkthroughProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </WalkthroughProvider>
  )
}
