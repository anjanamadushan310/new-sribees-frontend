/**
 * User App Settings — Super Admin only.
 *
 * Settings for the SRIBEESonline customer app that reach installed copies
 * without a Play Store release.
 *
 * This page used to hold a "Dynamic Splash Video" uploader. It never worked
 * end to end — it sent PUT with a `video` field to an endpoint that takes
 * POST with `file`, and the app has no video player on its splash — so it is
 * replaced by the Lottie splash animation, which the app does play.
 */
import React from 'react';
import { Divider, Typography } from 'antd';
import { MobileOutlined } from '@ant-design/icons';
import SplashAnimationCard from './SplashAnimationCard';

const { Title, Paragraph } = Typography;

const AppSettings: React.FC = () => (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Title level={3}>
            <MobileOutlined style={{ marginRight: 8 }} />
            User App Settings
        </Title>
        <Paragraph type="secondary">
            Settings for the SRIBEESonline mobile app. Changes here reach customers who already
            have the app installed; no app update is needed.
        </Paragraph>

        <Divider />

        <SplashAnimationCard />
    </div>
);

export default AppSettings;
