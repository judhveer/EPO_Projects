import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setAuthToken } from '../lib/api';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function boot() {
            try {
                if (!localStorage.getItem('token')) {
                    return;
                }
                const { data } = await api.get('/api/auth/me');
                setUser(data.user);
            }
            catch { }
            finally {
                setLoading(false);
            }
        }
        boot();
    }, []);

    const login = async (identifier, password) => {
        console.log("login called");
        const { data } = await api.post('/api/auth/login', { identifier, password });
        console.log("data: ", data);
        setAuthToken(data.token);
        setUser(data.user);
        return data.user;
    };

    const logout = () => {
        setAuthToken(null);
        setUser(null);
    };

    const value = useMemo(() => ({
        user, loading, login, logout
    }), [user, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
    return useContext(AuthContext);
}   