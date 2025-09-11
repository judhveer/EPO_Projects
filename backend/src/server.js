import { init } from './app.js';
import dotenv from 'dotenv';
dotenv.config();
const PORT = process.env.PORT || 5000;

init().then(app => {
    app.listen(PORT, () => {
        console.log(`Server running: http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Startup error:', err);
    process.exit(1);
});