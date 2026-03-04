require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const os = require('os');
const crypto = require('crypto');

function getMachineId() {
    const interfaces = os.networkInterfaces();
    const macs = [];
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
                macs.push(iface.mac);
            }
        }
    }
    const raw = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || ''}-${macs.sort().join(',')}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 24);
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://ioujmwlrsogwckclucpo.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.log('Cannot clear server: No Supabase Key');
    process.exit(0);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const machineId = getMachineId();
    console.log('Deleting trail for machine ID:', machineId);
    const { data, error } = await supabase.from('trial_records').delete().eq('machine_id', machineId);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Deleted remotely.');
    }
}
run();
