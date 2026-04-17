import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, Dropdown } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import useUserStore from '../../store/useUserStore';
import './index.css';

const navItems = [
  { key: '/', label: '工作台' },
  { key: '/pipeline', label: '流水线' },
  { key: '/settings', label: '系统设置' },
];

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUserStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="header-title" onClick={() => navigate('/')}>
          AI Dev Workflow
        </span>
        <nav className="header-nav">
          {navItems.map((item) => (
            <a
              key={item.key}
              className={location.pathname === item.key ? 'active' : ''}
              onClick={() => navigate(item.key)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="header-right">
        <Dropdown
          menu={{
            items: [
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: handleLogout,
              },
            ],
          }}
          placement="bottomRight"
        >
          <div className="header-user">
            <Avatar size={28} icon={<UserOutlined />} />
            <span className="header-username">{user?.nickname || user?.email}</span>
          </div>
        </Dropdown>
      </div>
    </header>
  );
};

export default Header;
