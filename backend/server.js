const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');
const winston = require('winston');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploaded data
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection
const db = require('./config/database');

// Test database connection
db.authenticate()
    .then(() => logger.info('Database connected successfully'))
    .catch(err => logger.error('Database connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/risk-assessment', require('./routes/riskAssessment'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/data', require('./routes/dataIngestion'));
app.use('/api/analysis', require('./routes/analysis'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
});

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
    logger.info('New client connected:', socket.id);

    socket.on('subscribe-to-alerts', (data) => {
        const { region } = data;
        socket.join(`alerts-${region}`);
        logger.info(`Client ${socket.id} subscribed to alerts for region: ${region}`);
    });

    socket.on('disconnect', () => {
        logger.info('Client disconnected:', socket.id);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start server
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

// Export for testing
module.exports = { app, io };