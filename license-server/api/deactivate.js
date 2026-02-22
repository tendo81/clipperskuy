/**
 * POST /api/deactivate
 * User CANNOT self-deactivate. Only admin can unbind via /api/admin/manage?action=unbind.
 * This endpoint is kept for backward compatibility but always returns an error.
 * 
 * Body: { key, machine_id }
 */
const { handleCors, parseBody } = require('./_lib/helpers');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // User cannot self-deactivate — only admin can unbind
    return res.status(403).json({
        success: false,
        reason: 'License tidak bisa di-deactivate sendiri. 1 license = 1 perangkat (terikat ke Machine ID). Hubungi admin jika perlu pindah ke perangkat lain.',
        contact_admin: true
    });
};
