import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Landing from './Landing.tsx'

// Two pages: the landing page at "/" and the shop app at "/app".
function Root() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const onNav = () => setPath(location.pathname)
    addEventListener('popstate', onNav)
    return () => removeEventListener('popstate', onNav)
  }, [])
  return path.startsWith('/app') ? <App /> : <Landing />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
