import { can as canFn } from '../lib/permissions';
import { useAuth } from '../context/AuthContext';

export function useCan(perm) {
    const { user } = useAuth();
    return canFn(user, perm);
}

export function Gate({ perm, children, fallback = null }) {
    const allowed = useCan(perm);
    return allowed ? children : fallback;
}