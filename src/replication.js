const axios = require('axios');
const { pool } = require('./db');

const getPeers = () => {
    const urls = process.env.PEER_URLS ? process.env.PEER_URLS.split(',') : [];
    return urls;
};

const startReplication = () => {
    const peers = getPeers();
    const interval = parseInt(process.env.REPLICATION_INTERVAL || '5000', 10);

    console.log(`[Replication] Started... polling every ${interval}ms`);
    console.log(`[Replication] Peers: ${peers.join(', ')}`);

    setInterval(async () => {
        try {
            const { rows: incidents } = await pool.query('SELECT * FROM incidents');
            for (const incident of incidents) {
                for (const peerUrl of peers) {
                    try {
                        const replicateUrl = `${peerUrl}/internal/replicate`;
                        await axios.post(replicateUrl, incident, { timeout: 2000 });
                        // console.log(`[Replication] Sent incident ${incident.id} to ${replicateUrl}`);
                    } catch (err) {
                        // Suppress logs for unreachable peers to avoid noise
                        // console.error(`[Replication] Error replicating to ${peerUrl}: ${err.message}`);
                    }
                }
            }
        } catch (err) {
            console.error('[Replication] Critical error fetching incidents:', err.message);
        }
    }, interval);
};

module.exports = {
    startReplication,
};
