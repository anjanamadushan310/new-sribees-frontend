import React, { useState } from 'react';
import { Form, Input, Button, Card, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/authStore';

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();
    const navigate = useNavigate();
    const { login } = useAuthStore();
    const { message } = App.useApp();

    const onFinish = async (values: { email: string; password: string }) => {
        setLoading(true);
        try {
            const cleanValues = {
                email: values.email?.trim().toLowerCase(),
                password: values.password,
            };
            const result = await authApi.login(cleanValues);
            login(result.user, result.tokens);
            message.success(result.message || 'Login successful!');
            navigate('/');
        } catch (error: any) {
            console.error('Login error:', error);
            message.error(
                error.response?.data?.detail ||
                error.response?.data?.message ||
                'Login failed. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
        >
            <Card
                title={
                    <div style={{ textAlign: 'center' }}>
                        <h1 style={{ margin: 0, fontSize: 28 }}>SRIBEESonline</h1>
                        <p style={{ margin: '8px 0 0', color: '#666' }}>Admin Dashboard</p>
                    </div>
                }
                style={{ width: 450, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
            >
                <Form
                    form={form}
                    name="login"
                    initialValues={{ remember: true }}
                    onFinish={onFinish}
                    size="large"
                >
                    <Form.Item
                        name="email"
                        normalize={(value) => (value ? value.trim() : value)}
                        rules={[
                            { required: true, message: 'Please input your email!' },
                            {
                                type: 'email',
                                message: 'Please enter a valid email!',
                                transform: (value: string) => value?.trim(),
                            },
                        ]}
                    >
                        <Input
                            prefix={<UserOutlined />}
                            placeholder="Email"
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Please input your password!' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder="Password"
                        />
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                        >
                            Log in
                        </Button>
                    </Form.Item>
                </Form>

            </Card>
        </div>
    );
};

export default Login;
