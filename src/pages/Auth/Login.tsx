import React, { useState } from 'react';
import { App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/authStore';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const navigate = useNavigate();
    const { login } = useAuthStore();
    const { message } = App.useApp();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setEmailError(null);
        setPasswordError(null);

        const cleanEmail = email.trim();
        let hasValidationErrors = false;

        if (!cleanEmail) {
            setEmailError('Please input your email!');
            hasValidationErrors = true;
        } else if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
            setEmailError('Please enter a valid email!');
            hasValidationErrors = true;
        }

        if (!password) {
            setPasswordError('Please input your password!');
            hasValidationErrors = true;
        }

        if (hasValidationErrors) {
            return;
        }

        setLoading(true);
        try {
            const cleanValues = {
                email: cleanEmail.toLowerCase(),
                password: password,
            };
            const result = await authApi.login(cleanValues);
            login(result.user, result.tokens);
            message.success(result.message || 'Login successful!');
            navigate('/');
        } catch (error: any) {
            console.error('Login error:', error);
            const serverMsg =
                error.response?.data?.detail ||
                error.response?.data?.message ||
                'Login failed. Please try again.';
            setErrorMessage(serverMsg);
            message.error(serverMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-root-wrapper">
            {/* SVG Global Definitions */}
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
                <defs>
                    <mask id="lg-m" maskUnits="userSpaceOnUse" x="270" y="150" width="730" height="900">
                        <rect x="270" y="150" width="730" height="900" fill="#fff" />
                        <g fill="#000" stroke="#000">
                            <path
                                d="M525 388V300C525 235 575 190 634 190C693 190 743 235 743 300V388"
                                fill="none"
                                strokeWidth="76"
                            />
                            <circle cx="525" cy="388" r="43" stroke="none" />
                            <circle cx="743" cy="388" r="43" stroke="none" />
                            <path
                                stroke="none"
                                d="M912 460C860 420 800 398 745 385C700 376 660 370 632 370C590 372 520 380 480 405C430 440 403 500 403 550C403 650 470 690 560 722C620 742 690 760 692 790C692 820 660 835 620 833C560 833 480 800 420 772C405 766 395 772 390 780L316 876C420 950 540 976 620 976C770 976 858 900 858 790C858 690 800 640 700 608C640 590 590 582 575 570C560 556 562 530 590 515C620 502 680 502 740 520C770 530 790 545 805 550C820 553 830 548 835 542Z"
                            />
                        </g>
                    </mask>
                    <g id="lg">
                        <path
                            mask="url(#lg-m)"
                            style={{ fill: 'var(--logo-fill, #d1044a)' }}
                            d="M400 315H870Q920 315 920 365L975 975Q978 1025 925 1025H340Q288 1025 291 975L350 360Q355 315 400 315Z"
                        />
                        <g style={{ fill: 'var(--logo-fill, #d1044a)', stroke: 'var(--logo-fill, #d1044a)' }}>
                            <path
                                d="M525 388V300C525 235 575 190 634 190C693 190 743 235 743 300V388"
                                fill="none"
                                strokeWidth="36"
                            />
                            <circle cx="525" cy="388" r="30" stroke="none" />
                            <circle cx="743" cy="388" r="30" stroke="none" />
                        </g>
                    </g>
                </defs>
            </svg>

            {/* Background Layers (Pure CSS + SVG) */}
            <div className="bg" aria-hidden="true">
                <div className="arc" />
                <div className="tile t1">
                    <svg viewBox="0 0 24 24">
                        <circle cx="9" cy="20" r="1" />
                        <circle cx="18" cy="20" r="1" />
                        <path d="M1 2h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                    </svg>
                </div>
                <div className="tile t2">
                    <svg viewBox="0 0 24 24" style={{ fill: 'rgba(255,214,229,.9)' }}>
                        <path d="M12 21s-7-4.6-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.4-9.3 9-9.3 9z" />
                    </svg>
                </div>
                <div className="tile t3">
                    <svg viewBox="0 0 24 24">
                        <path d="M1 4h15v12H1zM16 9h4l3 3v4h-7z" />
                        <circle cx="5.5" cy="18.5" r="2.2" />
                        <circle cx="18.5" cy="18.5" r="2.2" />
                    </svg>
                </div>

                <svg className="bag" viewBox="0 0 340 360" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="glow">
                            <stop offset="0" stopColor="#ff7aa5" stopOpacity=".7" />
                            <stop offset="1" stopColor="#ff7aa5" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <ellipse cx="170" cy="335" rx="190" ry="26" fill="url(#glow)" />
                    <svg x="45" y="6" width="250" height="308" viewBox="270 150 730 900" style={{ '--logo-fill': '#ffe6ee' } as React.CSSProperties}>
                        <use href="#lg" />
                    </svg>
                </svg>
            </div>

            {/* Brand Header */}
            <a className="brand" href="/" aria-label="Sribees Online home" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
                <span className="logo">
                    <svg viewBox="270 150 730 900">
                        <use href="#lg" />
                    </svg>
                </span>
                <span>SRIBEES <i>Online</i></span>
            </a>

            {/* Main Interactive Form Card */}
            <main className="page">
                <section className="card" aria-labelledby="title">
                    <h1 id="title">Welcome back</h1>
                    <p className="sub">Sign in to manage your orders and dashboard.</p>

                    <form id="loginForm" onSubmit={handleSubmit} noValidate>
                        {errorMessage && (
                            <div className="msg show" id="msg" role="alert">
                                {errorMessage}
                            </div>
                        )}

                        <div>
                            <label htmlFor="login_email">Email</label>
                            <input
                                id="login_email"
                                name="email"
                                type="email"
                                placeholder="Email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => {
                                    const cleanVal = e.target.value.replace(/\s+/g, '');
                                    setEmail(cleanVal);
                                    if (emailError) setEmailError(null);
                                }}
                                onBlur={() => {
                                    setEmail((prev) => prev.trim());
                                }}
                                required
                            />
                            {emailError && (
                                <div className="ant-form-item-explain-error" style={{ color: '#d81b5c', fontSize: '0.85rem', marginTop: 4 }}>
                                    {emailError}
                                </div>
                            )}
                        </div>

                        <div className="field">
                            <label htmlFor="login_password">Password</label>
                            <input
                                id="login_password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (passwordError) setPasswordError(null);
                                }}
                                required
                            />
                            <button
                                type="button"
                                className="toggle"
                                id="toggle"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                            {passwordError && (
                                <div className="ant-form-item-explain-error" style={{ color: '#d81b5c', fontSize: '0.85rem', marginTop: 4 }}>
                                    {passwordError}
                                </div>
                            )}
                        </div>

                        <button className="btn" type="submit" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign in / Log in'}
                        </button>
                    </form>
                </section>
            </main>

            {/* Embedded styles exactly matching the provided template */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Source+Serif+4:ital,wght@0,600;0,700;1,500&display=swap');

                .login-root-wrapper {
                    --crimson: #d81b5c;
                    --crimson-dark: #a8134a;
                    --blush: #fde8f0;
                    --ink: #3a0f22;
                    --muted: #7d5568;
                    --line: #f0c9d9;
                    --card: rgba(255,255,255,.86);

                    position: relative;
                    min-height: 100vh;
                    min-height: 100dvh;
                    width: 100vw;
                    font-family: "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
                    color: var(--ink);
                    background: var(--blush);
                    overflow-x: hidden;
                }

                /* ---------- Background (pure CSS + SVG, no photo) ---------- */
                .login-root-wrapper .bg {
                    position: fixed; inset: 0; z-index: 0; overflow: hidden;
                    background: radial-gradient(ellipse at 75% 40%, #fff 0%, #fde8f0 55%, #fbcfe0 100%);
                }
                .login-root-wrapper .arc {
                    position: absolute; left: -18vw; top: -20vh; width: 68vw; height: 140vh; border-radius: 50%;
                    background: radial-gradient(ellipse at 30% 35%, #ea336f 0%, #cf1b58 45%, #9e0e43 100%);
                    box-shadow: 0 0 0 2px rgba(255,255,255,.35), 0 0 70px rgba(255,255,255,.55);
                }
                .login-root-wrapper .arc::after { content: ""; position: absolute; inset: 7%; border-radius: 50%; border: 1px solid rgba(255,255,255,.14); }
                .login-root-wrapper .bag { position: absolute; left: 3vw; bottom: 5vh; width: min(30vw, 52vh); height: auto; overflow: visible; filter: drop-shadow(0 30px 30px rgba(90,0,35,.35)); }
                .login-root-wrapper .tile {
                    position: absolute; display: grid; place-items: center; border-radius: 18px;
                    background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22);
                    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
                }
                .login-root-wrapper .tile svg { width: 48%; height: 48%; fill: none; stroke: rgba(255,214,229,.9); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
                .login-root-wrapper .t1 { left: 22vw; top: 22vh; width: 6.2vw; min-width: 56px; aspect-ratio: 1; }
                .login-root-wrapper .t2 { left: 34vw; top: 37vh; width: 4vw; min-width: 44px; aspect-ratio: 1; border-radius: 14px; }
                .login-root-wrapper .t3 { left: 33vw; top: 54vh; width: 4.6vw; min-width: 48px; aspect-ratio: 1; }

                .login-root-wrapper .brand {
                    position: fixed; top: 28px; left: 40px; z-index: 2;
                    display: flex; align-items: center; gap: 14px; color: #fff; text-decoration: none;
                    font-family: "Source Serif 4", Georgia, serif; font-size: 1.7rem; font-weight: 700; letter-spacing: .01em;
                }
                .login-root-wrapper .brand:hover { text-decoration: none; color: #fff; }
                .login-root-wrapper .brand i { font-weight: 500; }
                .login-root-wrapper .brand .logo { width: 56px; height: 56px; border-radius: 16px; background: #fff; display: grid; place-items: center; }
                .login-root-wrapper .brand .logo svg { width: 62%; height: 62%; }

                /* ---------- Layout (desktop: card sits on the light side) ---------- */
                .login-root-wrapper .page {
                    min-height: 100vh; min-height: 100dvh;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    align-items: center;
                    position: relative;
                    z-index: 1;
                }
                .login-root-wrapper .card {
                    grid-column: 2;
                    justify-self: center;
                    width: min(440px, 100% - 48px);
                    padding: 40px 36px 32px;
                    background: var(--card);
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    border: 1px solid rgba(255,255,255,.9);
                    border-radius: 22px;
                    box-shadow: 0 24px 60px -20px rgba(168,19,74,.35);
                }

                .login-root-wrapper h1 {
                    font-family: "Source Serif 4", Georgia, serif;
                    font-weight: 700; font-size: 2rem; line-height: 1.15;
                    color: var(--ink);
                    margin: 0;
                }
                .login-root-wrapper .sub { margin-top: 8px; color: var(--muted); font-size: .97rem; }

                .login-root-wrapper form { margin-top: 28px; display: grid; gap: 18px; }
                .login-root-wrapper label { display: block; font-weight: 500; font-size: .9rem; margin-bottom: 6px; color: var(--ink); }
                .login-root-wrapper .field { position: relative; }
                .login-root-wrapper input[type="email"], 
                .login-root-wrapper input[type="password"], 
                .login-root-wrapper input[type="text"] {
                    width: 100%; height: 50px; padding: 0 16px;
                    font: inherit; font-size: 1rem; color: var(--ink);
                    background: #fff; border: 1.5px solid var(--line); border-radius: 12px;
                    transition: border-color .15s, box-shadow .15s;
                }
                .login-root-wrapper input::placeholder { color: #b797a6; }
                .login-root-wrapper input:focus { outline: none; border-color: var(--crimson); box-shadow: 0 0 0 4px rgba(216,27,92,.15); }
                .login-root-wrapper .field input[type="password"], .login-root-wrapper .field input.pw { padding-right: 64px; }
                .login-root-wrapper .toggle {
                    position: absolute; right: 8px; bottom: 8px; height: 34px; padding: 0 10px;
                    background: none; border: 0; border-radius: 8px; cursor: pointer;
                    font: inherit; font-size: .85rem; font-weight: 600; color: var(--crimson-dark);
                }
                .login-root-wrapper .toggle:hover { background: var(--blush); }

                .login-root-wrapper .btn {
                    height: 52px; border: 0; border-radius: 12px; cursor: pointer;
                    font: inherit; font-weight: 600; font-size: 1.02rem; color: #fff;
                    background: linear-gradient(135deg, #ea2d6c, var(--crimson-dark));
                    box-shadow: 0 10px 22px -10px rgba(168,19,74,.7);
                    transition: transform .12s, box-shadow .12s;
                    display: flex; align-items: center; justify-content: center;
                }
                .login-root-wrapper .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 26px -10px rgba(168,19,74,.8); }
                .login-root-wrapper .btn:active:not(:disabled) { transform: translateY(0); }
                .login-root-wrapper .btn:disabled { opacity: 0.7; cursor: not-allowed; }

                .login-root-wrapper .msg { display: none; padding: 10px 14px; border-radius: 10px; background: #ffe3ea; color: #9b1239; font-size: .9rem; }
                .login-root-wrapper .msg.show { display: block; }

                /* ---------- Tablet / small laptop ---------- */
                @media (max-width: 1100px) {
                    .login-root-wrapper .card { padding: 32px 28px 26px; }
                }

                /* ---------- Mobile & portrait tablet: crimson arc becomes a top banner ---------- */
                @media (max-width: 860px) {
                    .login-root-wrapper .arc { left: -40vw; width: 180vw; top: -70vh; height: calc(44dvh + 70vh); }
                    .login-root-wrapper .bag { left: 50%; transform: translateX(-50%); bottom: auto; top: 12dvh; height: 28dvh; width: auto; max-width: 70vw; }
                    .login-root-wrapper .tile { display: none; }
                    .login-root-wrapper .brand { left: 20px; top: 18px; font-size: 1.3rem; gap: 10px; }
                    .login-root-wrapper .brand .logo { width: 42px; height: 42px; border-radius: 12px; }
                    .login-root-wrapper .page { display: block; padding: calc(44dvh - 30px) 16px 32px; }
                    .login-root-wrapper .card {
                        width: 100%; max-width: 480px; margin: 0 auto;
                        padding: 28px 22px 24px; border-radius: 20px;
                        background: rgba(255,255,255,.94);
                    }
                    .login-root-wrapper h1 { font-size: 1.7rem; }
                }

                /* Short landscape phones */
                @media (max-height: 480px) and (max-width: 900px) and (orientation: landscape) {
                    .login-root-wrapper .bag { display: none; }
                    .login-root-wrapper .arc { height: 60dvh; }
                    .login-root-wrapper .page { padding-top: 40dvh; }
                }

                @media (prefers-reduced-motion: reduce) { 
                    .login-root-wrapper * { transition: none !important; } 
                }
            `}</style>
        </div>
    );
};

export default Login;
