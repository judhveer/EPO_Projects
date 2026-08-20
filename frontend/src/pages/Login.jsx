import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Formats raw seconds into MM:SS countdown string
// Used in the locked-out timer displayed on the button
function formatCountdown(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Login() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // null  = no warning shown yet
    // >= 1  = show "X attempts remaining" warning  
    // 0     = show "account locked" inside warning
    const [attemptsRemaining, setAttemptsRemaining] = useState(null);

    // Countdown timer in seconds — when > 0 the form is locked
    const [secondsLeft, setSecondsLeft] = useState(0);

    const { login } = useAuth();
    const nav = useNavigate();

    // Live countdown — ticks every second when secondsLeft > 0.
    // Automatically unlocks the form when it reaches zero.
    useEffect(() => {
        if(secondsLeft <= 0){
            return;
        }
        
        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if(prev <= 1){
                    clearInterval(timer);
                    // Unlock — clear the rate limit UI so they can try again
                    setErr('');
                    setAttemptsRemaining(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [secondsLeft]);

    // When the user types a different identifier, clear the attempts warning
    // because the counter is per-account — a new identifier has its own limit.
    const handleIdentifierChange = (e) => {
        setIdentifier(e.target.value);
        if (attemptsRemaining !== null && secondsLeft === 0) {
            setAttemptsRemaining(null);
            setErr('');
        }
    }

    async function onSubmit(e) {
        e.preventDefault();

        // Prevent submission while countdown is running
        if (secondsLeft > 0) return;

        setErr('');
        setLoading(true);
        try {
            await login(identifier, password);
            nav('/home', { replace: true });
        } catch (e) {
            const data    = e?.response?.data;
            const status  = e?.response?.status;
            const message = data?.message || 'Login failed';

            if (status === 429) {
                // Account locked — start the countdown
                const retryAfter = data?.retryAfter || 900;
                setErr(message);
                setAttemptsRemaining(0);
                setSecondsLeft(retryAfter);
            } else {
                // Wrong password — show attempts remaining if provided
                setErr(message);
                if (typeof data?.attemptsRemaining === 'number') {
                    setAttemptsRemaining(data.attemptsRemaining);
                }
            }
        }
        finally {
            setLoading(false);
        }
    }

    const isLocked = secondsLeft > 0;


    return (

        <div className='w-full h-screen flex '>

            <div className='w-full md:w-1/2 flex justify-center items-center bg-blue-700'>

                <div className="lg:w-full md:max-w-lg space-y-8  p-8 md:p-10 bg-white shadow-2xl rounded-lg">

                    {/* Logo + Title */}
                    <div className="mb-8">
                        <img src="/logo.jpg" alt="Logo" />
                    </div>

                    {/* Heading */}
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900">Welcome back</h2>
                        <p className="mt-1 text-sm text-gray-500">Please enter your details</p>
                    </div>


                    {/* {err && <div className="mb-2 text-center text-lg text-red-600">{err}</div>} */}
                    {/* Error message */}
                    {err && (
                        <div className="text-center text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        {err}
                        </div>
                    )}

                    {/* Attempts remaining warning — only shown after at least one failure */}
                    {attemptsRemaining !== null && !isLocked && (
                        <div className={`text-center text-sm rounded-md px-3 py-2 border ${
                        attemptsRemaining <= 1
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-amber-50 border-amber-300 text-amber-700'
                        }`}>
                        {attemptsRemaining === 0
                            ? 'No attempts remaining.'
                            : attemptsRemaining === 1
                            ? '⚠️ Last attempt — your account will be locked after this.'
                            : `⚠️ ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining before your account is temporarily locked.`
                        }
                        </div>
                    )}

                    {/* Locked countdown banner */}
                    {isLocked && (
                        <div className="text-center text-sm rounded-md px-3 py-2 bg-red-50 border border-red-300 text-red-700">
                        🔒 Account temporarily locked. Try again in{' '}
                        <span className="font-black tabular-nums">{formatCountdown(secondsLeft)}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={onSubmit} className="mt-6 space-y-4">

                        <div>
                            <label htmlFor="email" className='block text-sm font-medium text-gray-700' required>
                                Email address or Username
                            </label>
                            <input 
                                id='email' 
                                value={identifier} 
                                onChange={handleIdentifierChange}
                                placeholder='Enter your email address or username' 
                                className='mt-1 w-full border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#4F1C51] disabled:bg-gray-50 disabled:text-gray-400'
                                autoComplete='username' 
                                disabled={isLocked}
                                required 
                            />
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
                                    className="w-full border border-gray-300 rounded-md p-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[#4F1C51] disabled:bg-gray-50 disabled:text-gray-400"
                                    autoComplete="current-password"
                                    disabled={isLocked}
                                    required
                                />


                                <button
                                    type="button"
                                    onClick={() => setShowPassword(s => !s)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    title={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute inset-y-0 right-0 flex items-center px-3"
                                    disabled={isLocked}
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
                            disabled={loading || isLocked}
                            className='w-full font-medium border border-gray-300 py-2 rounded-md text-white  bg-[#0B4A8A] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed'
                        >
                            {isLocked
                                ? `Locked — ${formatCountdown(secondsLeft)}`
                                : loading
                                ? 'Logging in…'
                                : 'Log in'
                            }
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
