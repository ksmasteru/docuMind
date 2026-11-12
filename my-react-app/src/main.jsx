import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// the app's two faces (index.css: font-sans / font-ui, font-mono / font-data)
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/jetbrains-mono'
import App from './App.jsx'
import { keepFocusedFieldVisible } from './keepFocusVisible'

// the field being typed in never hides behind a phone's keyboard, on any page
keepFocusedFieldVisible()

createRoot(document.getElementById('root')).render(
    <App />
)
