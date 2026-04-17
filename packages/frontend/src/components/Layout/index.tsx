import { Outlet } from 'react-router-dom';
import Header from '../Header';

const Layout = () => {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Header />
      <Outlet />
    </div>
  );
};

export default Layout;
