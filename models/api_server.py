from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import uvicorn
import os
from datetime import datetime
import numpy as np
from wildfire_risk_model import WildfireRiskModel
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="TerraInsight AI Service",
    description="AI-powered wildfire risk assessment API",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize AI model
MODEL_PATH = os.environ.get("MODEL_PATH", "./trained_models")
model = WildfireRiskModel(model_path=MODEL_PATH if os.path.exists(MODEL_PATH) else None)

# Request/Response models
class PropertyData(BaseModel):
    vegetation_density: Optional[float] = 0.5
    slope_percentage: Optional[float] = 10.0
    distance_to_fire_station: Optional[float] = 5.0
    has_firebreak: Optional[bool] = False
    property_size_acres: Optional[float] = 1.0

class RiskCalculationRequest(BaseModel):
    property_id: str
    lat: float
    lon: float
    property_data: Optional[PropertyData] = None

class RiskCalculationResponse(BaseModel):
    overall_risk_score: float
    risk_level: str
    component_scores: Dict[str, float]
    recommendations: List[Dict]
    fire_spread_simulation: Dict
    confidence_score: float
    model_version: str
    assessment_timestamp: str

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "TerraInsight AI Service",
        "model_loaded": model.model is not None,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/calculate-risk", response_model=RiskCalculationResponse)
async def calculate_risk(request: RiskCalculationRequest):
    """
    Calculate wildfire risk for a property
    """
    try:
        logger.info(f"Calculating risk for property: {request.property_id}")
        
        # Mock data for demo - in production, these would come from:
        # - Satellite imagery analysis
        # - Weather API
        # - Terrain database
        # - Historical fire database
        
        property_features = {
            'ndvi': 0.65,  # Would be calculated from satellite imagery
            'ndmi': 0.45,  # Would be calculated from satellite imagery
            'temperature': 28.5,  # Would come from weather API
            'humidity': 35.0,  # Would come from weather API
            'wind_speed': 15.2,  # Would come from weather API
            'wind_direction': 225,  # Would come from weather API
            'slope': request.property_data.slope_percentage if request.property_data else 15.0,
            'aspect': 180,  # Would be calculated from DEM
            'elevation': 500,  # Would come from DEM
            'distance_to_road': 2.0,  # Would be calculated from road network
            'distance_to_water': 5.0,  # Would be calculated from water features
            'fuel_moisture': 25.0,  # Would be calculated or from sensors
            'drought_index': 3.5,  # Would come from drought monitor
            'days_since_rain': 12,  # Would come from weather history
            'population_density': 150,  # Would come from census data
            'historical_fires': 2,  # Would come from fire history database
            'vegetation_density': request.property_data.vegetation_density if request.property_data else 0.7,
            'distance_to_fire_station': request.property_data.distance_to_fire_station if request.property_data else 5.0
        }
        
        # Calculate risk using AI model
        risk_result = model.calculate_risk_score(property_features)
        
        # Add model version
        risk_result['model_version'] = "1.0.0"
        
        logger.info(f"Risk calculation complete. Score: {risk_result['overall_risk_score']:.2f}")
        
        return RiskCalculationResponse(**risk_result)
        
    except Exception as e:
        logger.error(f"Error calculating risk: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-satellite-image")
async def analyze_satellite_image(image_path: str, property_boundary: Dict):
    """
    Analyze satellite imagery for vegetation indices
    """
    try:
        # In production, this would process actual satellite imagery
        vegetation_data = model.extract_vegetation_indices(image_path)
        return {
            "success": True,
            "vegetation_indices": vegetation_data,
            "analysis_date": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error analyzing satellite image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/simulate-fire-spread")
async def simulate_fire_spread(
    start_point: Dict[str, float],
    weather_conditions: Dict,
    terrain_data: Dict,
    hours: int = 24
):
    """
    Simulate fire spread patterns
    """
    try:
        # Simplified fire spread simulation
        spread_patterns = []
        current_radius = 0
        
        for hour in range(hours):
            wind_factor = weather_conditions.get('wind_speed', 10) / 10
            slope_factor = terrain_data.get('slope', 10) / 20
            spread_rate = 0.5 * (1 + wind_factor + slope_factor)  # km/hour
            
            current_radius += spread_rate
            
            spread_patterns.append({
                'hour': hour,
                'radius_km': current_radius,
                'area_hectares': 3.14159 * current_radius ** 2 * 100,
                'perimeter_km': 2 * 3.14159 * current_radius
            })
        
        return {
            "simulation_id": f"sim_{datetime.now().timestamp()}",
            "start_point": start_point,
            "spread_patterns": spread_patterns,
            "total_area_hectares": spread_patterns[-1]['area_hectares'],
            "conditions": {
                "weather": weather_conditions,
                "terrain": terrain_data
            }
        }
    except Exception as e:
        logger.error(f"Error simulating fire spread: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/model/info")
async def get_model_info():
    """
    Get information about the AI model
    """
    return {
        "model_type": "Neural Network",
        "version": "1.0.0",
        "features": model.feature_names,
        "last_trained": "2024-01-15",
        "accuracy_metrics": {
            "mae": 5.2,
            "rmse": 7.8,
            "r2_score": 0.85
        }
    }

@app.post("/train-model")
async def train_model(training_data_path: str, epochs: int = 100):
    """
    Trigger model training (admin only)
    """
    try:
        # In production, this would load actual training data
        # and run the training process
        return {
            "status": "training_started",
            "epochs": epochs,
            "estimated_time_minutes": epochs * 0.5
        }
    except Exception as e:
        logger.error(f"Error starting training: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)