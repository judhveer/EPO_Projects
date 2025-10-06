import 'dotenv/config';
import {sequelize} from './../src/config/db.js';
import models from '../src/models/index.js';

const { User } = models;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection OK');

    let boss = await User.scope('withSecret').findOne({ where: { email: 'harshjw@gmail.com' } });
    let admin = await User.scope('withSecret').findOne({ where: {email: 'ic@easternpanorama.in'}});

    if(!admin){
      admin = await User.scope('withSecret').create({
        email: 'ic@easternpanorama.in',
        username: "Anita",
        role: "ADMIN",
        department: "Admin",
        passwordHash: 'Anita@123'
      });
      admin._password = 'Anita@123';
      await admin.save();
      console.log("Admin created: ", admin.id);
    }else{
      console.log('Admin already exists');
    }

    if (!boss) {
      boss = await User.scope('withSecret').create({
        email: 'harshjw@gmail.com',
        username: 'Harsh',
        role: 'BOSS',
        department: 'OWNER',
        passwordHash: 'Harsh@123'
      });
      boss._password = 'Harsh@123';
      await boss.save();
      console.log('Boss created:', boss.id);
    } else {
      console.log('Boss already exists');
    }
  } catch (e) {
    console.error('Error seeding admin:', e);
  } finally {
    await sequelize.close();
  }
})();
