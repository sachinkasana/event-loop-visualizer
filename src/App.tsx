import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import EventLoopVisualizer from './components/EventLoopVisualizer'

function App() {
  return (
    <>
      <EventLoopVisualizer />
      <Analytics />
      <SpeedInsights />
    </>
  );
}

export default App
