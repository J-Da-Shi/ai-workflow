import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import StageDetail from './pages/StageDetail';
import Settings from './pages/Settings';
import AuthRoute from './components/AuthRoute';
import Layout from './components/Layout';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页：不需要 Header */}
        <Route path="/login" element={<LoginPage />} />

        {/* 需要登录 + Header 的页面 */}
        <Route
          element={
            <AuthRoute>
              <Layout />
            </AuthRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/stage-detail" element={<StageDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
