const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RiskAssessment = sequelize.define('RiskAssessment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    property_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'properties',
            key: 'id'
        }
    },
    assessment_date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    overall_risk_score: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0,
            max: 100
        }
    },
    // Individual risk factors
    vegetation_risk: {
        type: DataTypes.FLOAT,
        validate: { min: 0, max: 100 }
    },
    weather_risk: {
        type: DataTypes.FLOAT,
        validate: { min: 0, max: 100 }
    },
    terrain_risk: {
        type: DataTypes.FLOAT,
        validate: { min: 0, max: 100 }
    },
    proximity_risk: {
        type: DataTypes.FLOAT,
        validate: { min: 0, max: 100 }
    },
    historical_risk: {
        type: DataTypes.FLOAT,
        validate: { min: 0, max: 100 }
    },
    // Environmental conditions at assessment time
    temperature_celsius: {
        type: DataTypes.FLOAT
    },
    humidity_percentage: {
        type: DataTypes.FLOAT
    },
    wind_speed_kmh: {
        type: DataTypes.FLOAT
    },
    wind_direction: {
        type: DataTypes.STRING
    },
    rainfall_last_30_days_mm: {
        type: DataTypes.FLOAT
    },
    drought_index: {
        type: DataTypes.FLOAT
    },
    // Vegetation analysis
    ndvi_score: {
        type: DataTypes.FLOAT,
        comment: 'Normalized Difference Vegetation Index'
    },
    dead_fuel_percentage: {
        type: DataTypes.FLOAT
    },
    canopy_coverage: {
        type: DataTypes.FLOAT
    },
    // AI model details
    model_version: {
        type: DataTypes.STRING,
        defaultValue: '1.0.0'
    },
    confidence_score: {
        type: DataTypes.FLOAT,
        validate: { min: 0, max: 1 }
    },
    // Recommendations
    recommendations: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    mitigation_actions: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    estimated_mitigation_cost: {
        type: DataTypes.DECIMAL(10, 2)
    },
    // Satellite imagery reference
    satellite_image_url: {
        type: DataTypes.STRING
    },
    satellite_image_date: {
        type: DataTypes.DATE
    },
    // Additional data
    fire_spread_simulation: {
        type: DataTypes.JSONB,
        comment: 'Simulated fire spread patterns under current conditions'
    },
    evacuation_time_minutes: {
        type: DataTypes.INTEGER
    },
    nearby_fire_history: {
        type: DataTypes.JSONB,
        defaultValue: []
    }
}, {
    tableName: 'risk_assessments',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            fields: ['property_id']
        },
        {
            fields: ['assessment_date']
        },
        {
            fields: ['overall_risk_score']
        }
    ]
});

// Class methods
RiskAssessment.getLatestForProperty = async function (propertyId) {
    return await this.findOne({
        where: { property_id: propertyId },
        order: [['assessment_date', 'DESC']]
    });
};

RiskAssessment.getHistoricalTrend = async function (propertyId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.findAll({
        where: {
            property_id: propertyId,
            assessment_date: {
                [sequelize.Sequelize.Op.gte]: startDate
            }
        },
        order: [['assessment_date', 'ASC']],
        attributes: ['assessment_date', 'overall_risk_score', 'weather_risk', 'vegetation_risk']
    });
};

module.exports = RiskAssessment;