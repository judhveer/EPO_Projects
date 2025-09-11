const sequelize = require('../../../config/db');
const { TelegramUser }  = require('../../../models');

const seedDoers = async () => {
  try {
    await sequelize.sync();

    const names = [
      "ANITA DORJEE",
      "ANISHA LYNGDOH",
      "ALVIN KHARBAMON",
      "AIDAHUNLIN NALLE JYRWA",
      "BANROILANG",
      "BANSHANLANG",
      "BANTYNSHAIN LYNGDOH",
      "BHAGYASHREE SINHA",
      "DORIS",
      "EVAMEDALYNE LANGSTANG",
      "FANNY",
      "HIMANI",
      "JENNIFER JYRWA",
      "JOEY",
      "KIRAN DAS",
      "MONICA LYNGDOH",
      "MOHAMMED SERAJ ANSARI",
      "MEWANKHRAW MAJAW",
      "RAJESH KUMAR THAKUR",
      "SANJAY THAPA",
      "SAFIRALIN",
      "SALEEM",
      "ROSHAN",
      "SICOVONTRITCHZ D THANKHIEW",
      "TITU BHOWMICK",
      "WANHUNLANG KHARSATI",
      "YUMNAM JACKSON SINGH",
      "JUDHVEER"
    ];

    const doers = names.map(name => ({
      name,
      chat_id: null // You can update later when they register
    }));

    await TelegramUser.bulkCreate(doers, { ignoreDuplicates: true });
    console.log('✅ All doers inserted successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error inserting doers:', error);
    process.exit(1);
  }
};

seedDoers();
