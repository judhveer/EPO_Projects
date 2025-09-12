import { can } from '../policies/access.js';

export function requireBossOrAdmin(req, res, next) {
    const role = req.user?.role;
    if (role === 'BOSS' || role === 'ADMIN') {
        return next();
    }

    return res.status(403).json({
        message: "Admins/Boss only",
        status: false,
        data: null
    });
}

export function requirePermission(perm){
    return (req, res, next) => {
        if(can(req.user, perm)){
            console.log(`Permission granted: ${perm} for user ${req.user?.id}`);
            return next();
        }
        return res.status(403).json({
            message: `You don't have permission to access this resource. Forbidden: ${perm}`,
            status: false,
            data: null
        });
    }
}