import axios from 'axios';
import cron from 'node-cron';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

// schedule cron job to run every Sunday at 4 AM
export function AttendanceSyncAll() {
    cron.schedule('0 4 * * 0', async () => {
        try {
            console.log('Running attendance sync cron job (office hours)...');

            const res = await axios.get(`${BASE_URL}/api/attendance/syncAll`);
            console.log('Attendance syncAll result:', res.data);
        } catch (error) {
            console.error('Attendance sync cron failed:', error.response?.data || error.message);
        }
    });


    cron.schedule('0 22 * * *', async () => {
        try {
            console.log('Running attendance sync cron job (office hours)...');
            const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
            const res = await axios.get(`${BASE_URL}/api/attendance/sync`);
            console.log('Attendance sync result:', res.data);
        } catch (error) {
            console.error('Attendance sync cron failed:', error.response?.data || error.message);
        }
    });

}