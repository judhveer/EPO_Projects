import 'dotenv/config';
import {sequelize} from './../src/config/db.js';
import models from '../src/models/index.js';

const { User } = models;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection OK');

    let user = await User.scope('withSecret').findOne({ where: { email: 'jaryalv08@gmail.com' } });
    if (!user) {
      user = await User.scope('withSecret').create({
        email: 'harshjw@gmail.com',
        username: 'Harsh',
        role: 'BOSS',
        department: 'OWNER',
        passwordHash: 'harsh@123'
      });
      user._password = 'harsh@123';
      await user.save();
      console.log('Boss created:', user.id);
    } else {
      console.log('Boss already exists');
    }
  } catch (e) {
    console.error('Error seeding admin:', e);
  } finally {
    await sequelize.close();
  }
})();
