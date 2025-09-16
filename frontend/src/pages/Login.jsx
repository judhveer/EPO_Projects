import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
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
                                autoComplete='username' required/>
                        </div>

                        <div>
                            <label htmlFor="password" className='block text-sm font-medium text-gray-700' required>
                                Password
                            </label>
                            <input type="password" id='password' name='password' value={password} onChange={e => setPassword(e.target.value)}
                                placeholder='••••••••' className='mt-1 w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#4F1C51]' autoComplete='current-password' required/>
                        </div>

                        <button
                            type='submit'
                            disabled={loading}
                            className='w-full text-blue-700 font-medium border border-gray-300 py-2 rounded-md text-white  bg-[#0B4A8A] hover:opacity-90 disabled:opacity-60'>
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
