const sequelize = require('../config/database');
const Property = require('../models/Property');
const RiskAssessment = require('../models/RiskAssessment');

async function initializeDatabase() {
    try {
        console.log('🚀 Initializing database...');

        // Test connection
        await sequelize.authenticate();
        console.log('✅ Database connection established');

        // Sync models (create tables)
        await sequelize.sync({ force: false }); // Set to true to drop existing tables
        console.log('✅ Database tables created');

        // Create spatial indices
        await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_boundary_gist 
      ON properties USING GIST (boundary);
    `);

        await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_center_gist 
      ON properties USING GIST (center_point);
    `);

        console.log('✅ Spatial indices created');

        // Create sample data
        const sampleProperty = await Property.create({
            address: '1234 Demo Forest Road, California, USA',
            owner_name: 'Demo User',
            owner_email: 'demo@terrainsight.ai',
            property_size_acres: 5.5,
            property_type: 'residential',
            boundary: {
                type: 'Polygon',
                coordinates: [[
                    [-122.419, 37.774],
                    [-122.418, 37.774],
                    [-122.418, 37.773],
                    [-122.419, 37.773],
                    [-122.419, 37.774]
                ]]
            },
            center_point: {
                type: 'Point',
                coordinates: [-122.4185, 37.7735]
            },
            current_risk_score: 45.5,
            vegetation_density: 0.7,
            slope_percentage: 15.2,
            distance_to_fire_station: 3.5,
            has_firebreak: false
        });

        console.log('✅ Sample property created:', sampleProperty.id);

        // Create sample risk assessment
        const sampleAssessment = await RiskAssessment.create({
            property_id: sampleProperty.id,
            overall_risk_score: 45.5,
            vegetation_risk: 60,
            weather_risk: 40,
            terrain_risk: 35,
            proximity_risk: 50,
            temperature_celsius: 28,
            humidity_percentage: 35,
            wind_speed_kmh: 15,
            ndvi_score: 0.65,
            recommendations: [
                {
                    priority: 'HIGH',
                    action: 'Clear vegetation within 30ft of structures',
                    estimated_cost: 2500
                },
                {
                    priority: 'MEDIUM',
                    action: 'Install ember-resistant vents',
                    estimated_cost: 800
                }
            ],
            model_version: '1.0.0',
            confidence_score: 0.82
        });

        console.log('✅ Sample risk assessment created:', sampleAssessment.id);

        console.log('\\n🎉 Database initialization complete!');
        console.log('\\nYou can now start the server with: npm run dev');

    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

// Run initialization
initializeDatabase();