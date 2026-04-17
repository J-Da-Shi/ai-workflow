import { useState } from 'react';
import { Form, Input, Button, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../../api/auth';
import useUserStore from '../../store/useUserStore';
import './index.css';

const LoginPage = () => {
    const navigate = useNavigate();
    const { setToken, setUser } = useUserStore();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('login');

    const handleLogin = async (values: { email: string; password: string }) => {
        setLoading(true);
        try {
            const res: any = await login(values);
            setToken(res.access_token);
            setUser(res.user);
            message.success('登录成功');
            navigate('/');
        } catch (error: any) {
            message.error(error.response?.data?.message || '登录失败');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (values: {
        email: string;
        password: string;
        nickname: string;
    }) => {
        setLoading(true);
        try {
            await register(values);
            message.success('注册成功，请登录');
            setActiveTab('login');
        } catch (error: any) {
            message.error(error.response?.data?.message || '注册失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <h1 className="login-title">AI Dev Workflow</h1>
                <p className="login-subtitle">AI 驱动的软件开发全流程工作流平台</p>

                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    centered
                    items={[
                        {
                            key: 'login',
                            label: '登录',
                            children: (
                                <Form onFinish={handleLogin} layout="vertical">
                                    <Form.Item
                                        name="email"
                                        label="邮箱"
                                        rules={[
                                            { required: true, message: '请输入邮箱' },
                                            { type: 'email', message: '邮箱格式不正确' },
                                        ]}
                                    >
                                        <Input
                                            prefix={<MailOutlined />}
                                            placeholder="请输入邮箱"
                                            size="large"
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        name="password"
                                        label="密码"
                                        rules={[{ required: true, message: '请输入密码' }]}
                                    >
                                        <Input.Password
                                            prefix={<LockOutlined />}
                                            placeholder="请输入密码"
                                            size="large"
                                        />
                                    </Form.Item>
                                    <Form.Item>
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                            loading={loading}
                                            block
                                            size="large"
                                        >
                                            登录
                                        </Button>
                                    </Form.Item>
                                </Form>
                            ),
                        },
                        {
                            key: 'register',
                            label: '注册',
                            children: (
                                <Form onFinish={handleRegister} layout="vertical">
                                    <Form.Item
                                        name="email"
                                        label="邮箱"
                                        rules={[
                                            { required: true, message: '请输入邮箱' },
                                            { type: 'email', message: '邮箱格式不正确' },
                                        ]}
                                    >
                                        <Input
                                            prefix={<MailOutlined />}
                                            placeholder="请输入邮箱"
                                            size="large"
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        name="nickname"
                                        label="昵称"
                                        rules={[{ required: true, message: '请输入昵称' }]}
                                    >
                                        <Input
                                            prefix={<UserOutlined />}
                                            placeholder="请输入昵称"
                                            size="large"
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        name="password"
                                        label="密码"
                                        rules={[
                                            { required: true, message: '请输入密码' },
                                            { min: 6, message: '密码至少6位' },
                                        ]}
                                    >
                                        <Input.Password
                                            prefix={<LockOutlined />}
                                            placeholder="密码至少6位"
                                            size="large"
                                        />
                                    </Form.Item>
                                    <Form.Item>
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                            loading={loading}
                                            block
                                            size="large"
                                        >
                                            注册
                                        </Button>
                                    </Form.Item>
                                </Form>
                            ),
                        },
                    ]}
                />
            </div>
        </div>
    );
};

export default LoginPage;
