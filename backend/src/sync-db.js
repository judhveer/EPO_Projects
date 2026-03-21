import sequelize from "./config/db.js";

async function syncDB() {
  try {
    await sequelize.sync({ alter: true });
    console.log("DB synced successfully");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

syncDB();