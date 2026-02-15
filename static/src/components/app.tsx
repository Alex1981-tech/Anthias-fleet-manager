import React, { useEffect } from 'react'
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
import Login from '@/components/auth/login'

const App: React.FC = () => {
  const { i18n } = useTranslation()

  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <>
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
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

export default App
