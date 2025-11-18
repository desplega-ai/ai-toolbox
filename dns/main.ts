import { promises as dns } from 'dns';

async function getA24zId(domain) {
    /**
     * Query _a24z.domain for TXT record and extract the ID.
     * 
     * @param {string} domain - The domain to query (e.g., 'tarasyarema.com')
     * @returns {string|null} The ID string if found, null otherwise
     */
    const queryName = `_a24z.${domain}`;

    try {
        // Query TXT records
        const records = await dns.resolveTxt(queryName);

        // TXT records are returned as array of arrays
        for (const record of records) {
            const txtString = record.join('');

            // Extract ID using regex
            const match = txtString.match(/id=([a-f0-9-]+)/);
            if (match) {
                return match[1];
            }
        }

        return null;

    } catch (error) {
        if (error.code === 'ENOTFOUND') {
            console.error(`Domain ${queryName} does not exist`);
        } else if (error.code === 'ENODATA') {
            console.error(`No TXT record found for ${queryName}`);
        } else {
            console.error(`Error querying DNS: ${error.message}`);
        }
        return null;
    }
}

// Example usage
const domain = "tarasyarema.com";
const id = await getA24zId(domain);

if (id) {
    console.log(`ID: ${id}`);
} else {
    console.log("No ID found");
}
