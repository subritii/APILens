import { auth } from '@/auth'
import { logout } from '@/app/actions/auth'
import { Workspace } from '@/components/workspace'

export default async function DashboardPage() {
  const session = await auth()

  return <Workspace email={session?.user?.email ?? ''} logout={logout} />
}
