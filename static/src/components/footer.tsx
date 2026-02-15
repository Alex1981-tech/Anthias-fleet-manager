import React from 'react'
import { useTranslation } from 'react-i18next'
import { FaGithub } from 'react-icons/fa'

const Footer: React.FC = () => {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="fm-footer">
      <div className="footer-inner">
        <p className="footer-text">
          &copy; {currentYear}{' '}
          <a
            href="https://github.com/Alex1981-tech/Anthias-fleet-manager"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('footer.copyright')}
          </a>
        </p>
        <ul className="footer-links">
          <li>
            <a
              href="https://github.com/Alex1981-tech/Anthias-fleet-manager"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FaGithub style={{ marginRight: '0.3rem', verticalAlign: '-2px' }} />
              GitHub
            </a>
          </li>
        </ul>
      </div>
    </footer>
  )
}

export default Footer
