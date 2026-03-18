const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // 确保你的 db.js 连接配置正确

// 接口 1：用户注册 (POST /api/auth/register)
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "邮箱和密码不能为空" });

        // 1. 检查用户是否已存在
        const [existing] = await pool.query('SELECT * FROM users WHERE username = ?', [email]);
        if (existing.length > 0) return res.status(409).json({ message: "该邮箱已注册" });

        // 2. 加密密码
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. 存入数据库 (我们将 email 存入数据库的 username 字段)
        await pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [email, hashedPassword]);
        res.status(201).json({ code: 200, message: "注册成功，请前往登录" });

    } catch (error) {
        console.error("注册报错:", error);
        res.status(500).json({ message: "服务器内部错误" });
    }
});

// 接口 2：用户登录 (POST /api/auth/login)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. 查询用户
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [email]);
        if (users.length === 0) return res.status(401).json({ message: "邮箱或密码错误" });
        
        const user = users[0];

        // 2. 比对密码
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: "邮箱或密码错误" });

        // 3. 签发 Token
        const token = jwt.sign(
            { userId: user.id, email: user.username }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({ code: 200, message: "登录成功", data: { token } });

    } catch (error) {
        console.error("登录报错:", error);
        res.status(500).json({ message: "服务器内部错误" });
    }
});

module.exports = router;