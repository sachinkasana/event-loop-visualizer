import { Analytics } from '@vercel/analytics/react'
import EventLoopVisualizer from './components/EventLoopVisualizer'

function App() {
  return (
    <>
      <EventLoopVisualizer />
      <Analytics />
    </>
  );
}

export default App
