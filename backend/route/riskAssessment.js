const express = require('express');
const router = express.Router();
const axios = require('axios');
const Property = require('../models/Property');
const RiskAssessment = require('../models/RiskAssessment');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// Python AI service URL (configure in .env)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * GET /api/risk-assessment/:propertyId
 * Get the latest risk assessment for a property
 */
router.get('/:propertyId', async (req, res) => {
    try {
        const { propertyId } = req.params;

        // Get property details
        const property = await Property.findByPk(propertyId);
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }

        // Get latest assessment
        const assessment = await RiskAssessment.getLatestForProperty(propertyId);

        res.json({
            property: {
                id: property.id,
                address: property.address,
                current_risk_score: property.current_risk_score
            },
            assessment: assessment || null
        });
    } catch (error) {
        console.error('Error fetching risk assessment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/risk-assessment/calculate/:propertyId
 * Calculate new risk assessment for a property
 */
router.post('/calculate/:propertyId', async (req, res) => {
    try {
        const { propertyId } = req.params;

        // Get property details
        const property = await Property.findByPk(propertyId);
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }

        // Get property center coordinates
        const center = property.center_point.coordinates;

        // Call Python AI service for risk calculation
        const aiResponse = await axios.post(`${AI_SERVICE_URL}/calculate-risk`, {
            property_id: propertyId,
            lat: center[1],
            lon: center[0],
            property_data: {
                vegetation_density: property.vegetation_density,
                slope_percentage: property.slope_percentage,
                distance_to_fire_station: property.distance_to_fire_station,
                has_firebreak: property.has_firebreak,
                property_size_acres: property.property_size_acres
            }
        });

        const riskData = aiResponse.data;

        // Create new risk assessment record
        const assessment = await RiskAssessment.create({
            property_id: propertyId,
            overall_risk_score: riskData.overall_risk_score,
            vegetation_risk: riskData.component_scores.vegetation_risk,
            weather_risk: riskData.component_scores.weather_risk,
            terrain_risk: riskData.component_scores.terrain_risk,
            proximity_risk: riskData.component_scores.proximity_risk,
            recommendations: riskData.recommendations,
            fire_spread_simulation: riskData.fire_spread_simulation,
            confidence_score: riskData.confidence_score,
            model_version: riskData.model_version || '1.0.0'
        });

        // Update property's current risk score
        await property.update({
            current_risk_score: riskData.overall_risk_score,
            last_assessment_date: new Date()
        });

        // Emit real-time update via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.emit('risk-update', {
                property_id: propertyId,
                risk_score: riskData.overall_risk_score,
                risk_level: riskData.risk_level
            });
        }

        res.json({
            success: true,
            assessment: assessment,
            risk_level: riskData.risk_level
        });

    } catch (error) {
        console.error('Error calculating risk assessment:', error);
        res.status(500).json({
            error: 'Failed to calculate risk assessment',
            details: error.message
        });
    }
});

/**
 * GET /api/risk-assessment/history/:propertyId
 * Get historical risk assessments for a property
 */
router.get('/history/:propertyId', async (req, res) => {
    try {
        const { propertyId } = req.params;
        const { days = 30 } = req.query;

        const history = await RiskAssessment.getHistoricalTrend(propertyId, parseInt(days));

        res.json({
            property_id: propertyId,
            days: parseInt(days),
            assessments: history
        });
    } catch (error) {
        console.error('Error fetching assessment history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/risk-assessment/high-risk-properties
 * Get all properties with high risk scores
 */
router.get('/high-risk-properties', async (req, res) => {
    try {
        const { threshold = 70, limit = 50 } = req.query;

        const properties = await Property.findHighRiskProperties(parseFloat(threshold));

        res.json({
            threshold: parseFloat(threshold),
            count: properties.length,
            properties: properties.slice(0, parseInt(limit))
        });
    } catch (error) {
        console.error('Error fetching high risk properties:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/risk-assessment/bulk-calculate
 * Calculate risk for multiple properties in an area
 */
router.post('/bulk-calculate', async (req, res) => {
    try {
        const { center_lat, center_lon, radius_km = 10 } = req.body;

        // Find properties within radius
        const properties = await Property.findWithinRadius(
            { lat: center_lat, lng: center_lon },
            radius_km
        );

        // Queue risk calculations
        const calculations = properties.map(async (property) => {
            try {
                const response = await axios.post(
                    `${AI_SERVICE_URL}/calculate-risk`,
                    {
                        property_id: property.id,
                        lat: property.center_point.coordinates[1],
                        lon: property.center_point.coordinates[0]
                    }
                );
                return {
                    property_id: property.id,
                    success: true,
                    risk_score: response.data.overall_risk_score
                };
            } catch (error) {
                return {
                    property_id: property.id,
                    success: false,
                    error: error.message
                };
            }
        });

        const results = await Promise.all(calculations);

        res.json({
            center: { lat: center_lat, lon: center_lon },
            radius_km,
            properties_found: properties.length,
            calculations: results
        });

    } catch (error) {
        console.error('Error in bulk calculation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/risk-assessment/statistics
 * Get risk statistics for a region
 */
router.get('/statistics', async (req, res) => {
    try {
        const stats = await sequelize.query(`
      SELECT 
        COUNT(*) as total_properties,
        AVG(current_risk_score) as avg_risk_score,
        MAX(current_risk_score) as max_risk_score,
        MIN(current_risk_score) as min_risk_score,
        COUNT(CASE WHEN current_risk_score >= 80 THEN 1 END) as extreme_risk_count,
        COUNT(CASE WHEN current_risk_score >= 60 AND current_risk_score < 80 THEN 1 END) as high_risk_count,
        COUNT(CASE WHEN current_risk_score >= 40 AND current_risk_score < 60 THEN 1 END) as moderate_risk_count,
        COUNT(CASE WHEN current_risk_score < 40 THEN 1 END) as low_risk_count
      FROM properties
    `, { type: sequelize.QueryTypes.SELECT });

        res.json(stats[0]);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;