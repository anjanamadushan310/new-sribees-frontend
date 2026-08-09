import React, { useState } from 'react';
import { Card, Tabs, Form, Input, Button, message } from 'antd';
import type { TabsProps } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../store/authStore';
import { AdminRole } from '../../types/admin.types';
import { authApi } from '../../api/auth.api';
import { apiErrorMessage } from '../../utils/analytics';
import DeliveryZones from './DeliveryZones';

const Settings: React.FC = () => {
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const user = useAuthStore((s) => s.user);
    const updateUser = useAuthStore((s) => s.updateUser);
    const isSuperAdmin = user?.role === AdminRole.SUPER_ADMIN;

    const handleProfileUpdate = async (values: { name: string }) => {
        setSavingProfile(true);
        try {
            const updated = await authApi.updateProfile(values.name.trim());
            updateUser(updated);
            message.success('Profile updated successfully');
        } catch (error) {
            message.error(apiErrorMessage(error));
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePasswordChange = async (values: { currentPassword: string; newPassword: string }) => {
        setSavingPassword(true);
        try {
            await authApi.changePassword(values.currentPassword, values.newPassword);
            message.success('Password changed successfully — other sessions have been signed out');
            passwordForm.resetFields();
        } catch (error) {
            message.error(apiErrorMessage(error));
        } finally {
            setSavingPassword(false);
        }
    };

    const items: TabsProps['items'] = [
        {
            key: 'profile',
            label: 'Profile',
            children: (
                <Form
                    form={profileForm}
                    layout="vertical"
                    onFinish={handleProfileUpdate}
                    initialValues={{
                        name: user?.full_name ?? 'Admin User',
                        email: user?.email ?? '',
                    }}
                    style={{ maxWidth: 600 }}
                >
                    <Form.Item
                        label="Full Name"
                        name="name"
                        rules={[{ required: true, message: 'Please enter your name' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="Full Name" />
                    </Form.Item>

                    <Form.Item
                        label="Email"
                        name="email"
                        rules={[
                            { required: true, message: 'Please enter your email' },
                            { type: 'email', message: 'Please enter a valid email' },
                        ]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="Email" disabled />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={savingProfile}>
                            Update Profile
                        </Button>
                    </Form.Item>
                </Form>
            ),
        },
        {
            key: 'password',
            label: 'Change Password',
            children: (
                <Form
                    form={passwordForm}
                    layout="vertical"
                    onFinish={handlePasswordChange}
                    style={{ maxWidth: 600 }}
                >
                    <Form.Item
                        label="Current Password"
                        name="currentPassword"
                        rules={[{ required: true, message: 'Please enter your current password' }]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Current Password" />
                    </Form.Item>

                    <Form.Item
                        label="New Password"
                        name="newPassword"
                        rules={[
                            { required: true, message: 'Please enter your new password' },
                            { min: 8, message: 'Password must be at least 8 characters' },
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="New Password" />
                    </Form.Item>

                    <Form.Item
                        label="Confirm New Password"
                        name="confirmPassword"
                        dependencies={['newPassword']}
                        rules={[
                            { required: true, message: 'Please confirm your new password' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('newPassword') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Passwords do not match'));
                                },
                            }),
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Confirm New Password" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={savingPassword}>
                            Change Password
                        </Button>
                    </Form.Item>
                </Form>
            ),
        },
        // Delivery Zones (master Post Office directory) — Super Admin only.
        ...(isSuperAdmin
            ? [
                  {
                      key: 'delivery-zones',
                      label: 'Delivery Zones',
                      children: <DeliveryZones />,
                  },
              ]
            : []),
        {
            key: 'notifications',
            label: 'Notifications',
            children: (
                <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                    <p>Notification settings will be available soon.</p>
                </div>
            ),
        },
    ];

    return (
        <div>
            <h1 style={{ marginBottom: 24 }}>Settings</h1>
            <Card>
                <Tabs defaultActiveKey="profile" items={items} />
            </Card>
        </div>
    );
};

export default Settings;
