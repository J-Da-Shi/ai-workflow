import { useEffect } from 'react'
import { getUser } from './api/user'
import './App.css'

function App() {
  useEffect(() => {
    getUser().then((res) => {
      console.log(res, 'res')
    })
  }, [])

  return (
    <div>

    </div>
  )
}

export default App
