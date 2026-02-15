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

      <div className="fm-card fm-card-accent">
        <div className="fm-card-body p-0">
          {changelog.map((entry, idx) => (
            <div key={entry.version} className={idx < changelog.length - 1 ? 'border-bottom' : ''} style={{ padding: '0.75rem 1.25rem' }}>
              <div className="d-flex align-items-center gap-2 mb-1">
                <strong style={{ fontSize: '0.95rem' }}>v{entry.version}</strong>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>{entry.date}</span>
              </div>
              <ul className="mb-0 ps-3">
                {entry.changeKeys.map((key) => (
                  <li key={key} style={{ fontSize: '0.85rem' }}>
                    {t(`changelog.changes.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default ChangelogPage
