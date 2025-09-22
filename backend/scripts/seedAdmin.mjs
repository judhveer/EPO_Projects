import 'dotenv/config';
import models from '../src/models/index.js';

const { sequelize, User } = models;

(async () => {
  try {
    await sequelize.authenticate();
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
    console.error(e);
  } finally {
    await sequelize.close();
  }
})();
