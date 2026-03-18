//数据库连接配置
const mysql = require('mysql2/promise');
require('dotenv').config(); // 确保能读到 .env

// 创建并导出一个统一的数据库连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;