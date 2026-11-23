import mysql from 'mysql2';

mysql.createConnection({ host: 'db', ssl: { rejectUnauthorized: true } });
