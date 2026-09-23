import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SiteContentProvider } from './data/SiteContent'
import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root container #root not found')
}

createRoot(container).render(
  <StrictMode>
    {/* 站点内容从后台读，因此 Provider 必须包住整个应用（含页眉页脚） */}
    <SiteContentProvider>
      <App />
    </SiteContentProvider>
  </StrictMode>,
)
