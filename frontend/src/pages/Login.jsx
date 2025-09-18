import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { login } = useAuth();
    const nav = useNavigate();

    async function onSubmit(e) {
        e.preventDefault();
        setErr('');
        setLoading(true);
        try {
            await login(identifier, password);
            nav('/home', { replace: true });
        } catch (e) {
            setErr(e?.response?.data?.message || 'Login failed');
        }
        finally {
            setLoading(false);
        }
    }


    return (

        <div className='w-full h-screen flex '>

            <div className='w-full md:w-1/2 flex justify-center items-center bg-blue-700'>

                <div className="lg:w-full md:max-w-lg space-y-8  p-8 md:p-10 bg-white shadow-2xl rounded-lg">

                    {/* Logo + Title */}
                    <div className="mb-8">
                        <img src="/logo.png" alt="Logo" />
                    </div>

                    {/* Heading */}
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
                        <p className="mt-1 text-sm text-gray-500">Please enter your details</p>
                    </div>


                    {err && <div className="mb-2 text-center text-lg text-red-600">{err}</div>}

                    {/* Form */}
                    <form onSubmit={onSubmit} className="mt-6 space-y-4">

                        <div>
                            <label htmlFor="email" className='block text-sm font-medium text-gray-700' required>
                                Email address or Username
                            </label>
                            <input id='email' value={identifier} onChange={e => setIdentifier(e.target.value)}
                                placeholder='Enter your email address or username' className='mt-1 w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#4F1C51]'
                                autoComplete='username' required />
                        </div>

                        <div>
                            <label htmlFor="password" className='block text-sm font-medium text-gray-700' required>
                                Password
                            </label>
                            {/* Password input with show/hide button */}

                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full border border-gray-300 rounded-md p-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#4F1C51]"
                                    autoComplete="current-password"
                                    required
                                />


                                <button
                                    type="button"
                                    onClick={() => setShowPassword(s => !s)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute inset-y-0 right-0 flex items-center px-3"
                                >
                                    {showPassword ? (
                                        // Eye-off icon
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-5 0-9.27-3.11-11-7 1.07-2.12 2.85-3.95 5.04-5.2" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                                        </svg>
                                    ) : (
                                        // Eye icon
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </button>

                            </div>
                        </div>

                        <button
                            type='submit'
                            disabled={loading}
                            className='w-full font-medium border border-gray-300 py-2 rounded-md text-white  bg-[#0B4A8A] hover:opacity-90 disabled:opacity-60'>
                            {loading ? 'Logging in…' : 'Log in'}
                        </button>

                    </form>


                </div>

            </div>

            <div className="hidden w-1/2 md:block">
                <img
                    src="/login-image.jpg"
                    alt="Banner"
                    className="w-full h-full md:object-cover"
                />
            </div>

        </div>

    )



}
