import models from "../../models/index.js";
const { ClientDetails } = models;
import { Op } from "sequelize";
import { getCache, setCache, TTL, CACHE_KEYS } from "../../utils/cache.js";


// Get client names (autocomplete)

export const getClientNames = async (req, res) => {
    try{
        const q = req.query?.q?.trim().toUpperCase() || "";

        // Cache the FULL client name list — filter in JS per search term.
        // One cache key covers every possible search query.
        const cacheKey = CACHE_KEYS.clientNames;
        let allNames = await getCache(cacheKey);

        if(!allNames){
            const clients = await ClientDetails.findAll({
                attributes: ["client_name"],
                order: [["client_name", "ASC"]],
            });

            allNames = clients.map((c) => c.client_name);
            await setCache(cacheKey, allNames, TTL.CLIENTS);
        }

        const filtered = q 
            ? allNames.filter((name) => name.includes(q))
            : allNames;

        return res.json(filtered);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch clients" });
    }
};


// Get full client details by name
export const getFullDetails = async (req, res) => {
    try {
    const name = req.params.client_name.toUpperCase();
    const client = await ClientDetails.findOne({ where: { client_name: name } });
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch client details" });
  }
};

