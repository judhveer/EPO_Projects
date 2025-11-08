import models from "../../models/index.js";
const { ClientDetails } = models;
import { Op } from "sequelize";


// Get client names (autocomplete)

export const getClientNames = async (req, res) => {
    try{
        const q = req.query?.q.trim().toUpperCase() || "";
        const clients = await ClientDetails.findAll({
            where: {
                client_name: { [Op.like]: `%${q}%` },
            },
            attributes: ["client_name"]
        });
        res.json(clients.map((c) => c.client_name));
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

