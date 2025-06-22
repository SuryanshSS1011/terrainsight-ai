const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Property = sequelize.define('Property', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    address: {
        type: DataTypes.STRING,
        allowNull: false
    },
    owner_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    owner_email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            isEmail: true
        }
    },
    owner_phone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    property_size_acres: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    property_type: {
        type: DataTypes.ENUM('residential', 'commercial', 'agricultural', 'forest', 'mixed'),
        defaultValue: 'residential'
    },
    // PostGIS geometry column for property boundary
    boundary: {
        type: DataTypes.GEOMETRY('POLYGON', 4326),
        allowNull: false
    },
    // PostGIS point for property center
    center_point: {
        type: DataTypes.GEOMETRY('POINT', 4326),
        allowNull: false
    },
    // Risk assessment data
    current_risk_score: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
            min: 0,
            max: 100
        }
    },
    last_assessment_date: {
        type: DataTypes.DATE,
        allowNull: true
    },
    vegetation_density: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    slope_percentage: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    distance_to_fire_station: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Distance in kilometers'
    },
    has_firebreak: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    last_vegetation_management: {
        type: DataTypes.DATE,
        allowNull: true
    },
    insurance_provider: {
        type: DataTypes.STRING,
        allowNull: true
    },
    insurance_premium: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSONB,
        defaultValue: {}
    }
}, {
    tableName: 'properties',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            type: 'SPATIAL',
            fields: ['boundary']
        },
        {
            type: 'SPATIAL',
            fields: ['center_point']
        },
        {
            fields: ['current_risk_score']
        },
        {
            fields: ['owner_email']
        }
    ]
});

// Instance methods
Property.prototype.calculateRiskFactors = async function () {
    // This will be implemented with our AI model
    const factors = {
        vegetation: this.vegetation_density * 0.3,
        slope: this.slope_percentage * 0.2,
        proximity_to_services: (100 - this.distance_to_fire_station) * 0.2,
        maintenance: this.has_firebreak ? -10 : 0,
        historical_fires: 0 // Will be calculated based on historical data
    };

    return factors;
};

// Class methods
Property.findWithinRadius = async function (centerPoint, radiusKm) {
    const query = `
    SELECT * FROM properties
    WHERE ST_DWithin(
      center_point::geography,
      ST_GeomFromText('POINT(${centerPoint.lng} ${centerPoint.lat})', 4326)::geography,
      ${radiusKm * 1000}
    )
    ORDER BY current_risk_score DESC;
  `;

    return await sequelize.query(query, {
        model: Property,
        mapToModel: true
    });
};

Property.findHighRiskProperties = async function (threshold = 70) {
    return await this.findAll({
        where: {
            current_risk_score: {
                [sequelize.Sequelize.Op.gte]: threshold
            }
        },
        order: [['current_risk_score', 'DESC']]
    });
};

module.exports = Property;