import React from 'react'
import { useTranslation } from 'react-i18next'
import { FaCodeBranch } from 'react-icons/fa'
import { changelog } from '../changelog'

const ChangelogPage: React.FC = () => {
  const { t } = useTranslation()

  return (
    <>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaCodeBranch className="page-icon" />
            {t('changelog.title')}
          </h1>
          <p className="page-subtitle">{t('changelog.subtitle')}</p>
        </div>
      </div>

      {changelog.map((entry) => (
        <div key={entry.version} className="fm-card fm-card-accent">
          <div className="fm-card-header">
            <h5 className="card-title">v{entry.version}</h5>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              {entry.date}
            </span>
          </div>
          <div className="fm-card-body">
            <ul className="mb-0 ps-3">
              {entry.changeKeys.map((key) => (
                <li key={key} className="mb-1" style={{ fontSize: '0.9rem' }}>
                  {t(`changelog.changes.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </>
  )
}

export default ChangelogPage
