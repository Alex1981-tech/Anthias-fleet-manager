import React, { useEffect, useState, createContext } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Navbar from './navbar'
import Footer from './footer'
import Dashboard from '@/components/dashboard/index'
import PlayerList from '@/components/players/player-list'
import PlayerDetail from '@/components/players/player-detail'
import GroupList from '@/components/groups/group-list'
import ContentPage from '@/components/deploy/deploy-form'
import DeployHistory from '@/components/deploy/deploy-history'
import DeployProgress from '@/components/deploy/deploy-progress'
import Settings from '@/components/settings/settings'
import AuditLog from '@/components/settings/audit-log'
import Login from '@/components/auth/login'
import ChangelogPage from '@/components/changelog-page'
import { users as usersApi } from '@/services/api'

export type UserRole = 'viewer' | 'editor' | 'admin' | null

export const RoleContext = createContext<UserRole>(null)

const App: React.FC = () => {
  const { i18n } = useTranslation()
  const [role, setRole] = useState<UserRole>(null)

  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  useEffect(() => {
    usersApi.me().then((u) => {
      setRole(u.role)
    }).catch(() => {})
  }, [])

  return (
    <RoleContext.Provider value={role}>
      <Navbar />
      <main className="fm-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/players" element={<PlayerList />} />
          <Route path="/players/:id" element={<PlayerDetail />} />
          <Route path="/groups" element={<GroupList />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/deploy/history" element={<DeployHistory />} />
          <Route path="/deploy/:id" element={<DeployProgress />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
      <Footer />
    </RoleContext.Provider>
  )
}

export default App
