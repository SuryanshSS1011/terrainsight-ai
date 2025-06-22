import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import geopandas as gpd
import rasterio
from rasterio.features import geometry_mask
import cv2
from datetime import datetime, timedelta
import json
import os
from typing import Dict, List, Tuple, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WildfireRiskModel:
    """
    AI model for assessing wildfire risk using satellite imagery,
    weather data, and terrain characteristics.
    """
    
    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = [
            'ndvi', 'ndmi', 'temperature', 'humidity', 'wind_speed',
            'slope', 'aspect', 'elevation', 'distance_to_road',
            'distance_to_water', 'fuel_moisture', 'drought_index',
            'days_since_rain', 'population_density', 'historical_fires'
        ]
        
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)
        else:
            self.build_model()
    
    def build_model(self):
        """Build the neural network architecture."""
        inputs = keras.Input(shape=(len(self.feature_names),))
        
        # Feature engineering layers
        x = keras.layers.Dense(128, activation='relu')(inputs)
        x = keras.layers.BatchNormalization()(x)
        x = keras.layers.Dropout(0.3)(x)
        
        x = keras.layers.Dense(64, activation='relu')(x)
        x = keras.layers.BatchNormalization()(x)
        x = keras.layers.Dropout(0.2)(x)
        
        x = keras.layers.Dense(32, activation='relu')(x)
        x = keras.layers.BatchNormalization()(x)
        
        # Output layer - risk score between 0 and 100
        output = keras.layers.Dense(1, activation='sigmoid')(x)
        output = keras.layers.Lambda(lambda x: x * 100)(output)
        
        self.model = keras.Model(inputs=inputs, outputs=output)
        self.model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        logger.info("Model architecture built successfully")
    
    def extract_vegetation_indices(self, satellite_image_path: str) -> Dict[str, float]:
        """Extract vegetation indices from satellite imagery."""
        with rasterio.open(satellite_image_path) as src:
            # Read bands (assuming Sentinel-2 or similar)
            # B2: Blue, B3: Green, B4: Red, B8: NIR, B11: SWIR
            nir = src.read(8).astype(float)
            red = src.read(4).astype(float)
            swir = src.read(11).astype(float)
            
            # Calculate NDVI (Normalized Difference Vegetation Index)
            ndvi = (nir - red) / (nir + red + 1e-10)
            ndvi_mean = np.nanmean(ndvi)
            
            # Calculate NDMI (Normalized Difference Moisture Index)
            ndmi = (nir - swir) / (nir + swir + 1e-10)
            ndmi_mean = np.nanmean(ndmi)
            
            # Estimate fuel moisture content
            fuel_moisture = 100 * (1 - np.exp(-2 * ndmi_mean))
            
            return {
                'ndvi': ndvi_mean,
                'ndmi': ndmi_mean,
                'fuel_moisture': fuel_moisture,
                'vegetation_cover': np.sum(ndvi > 0.3) / ndvi.size
            }
    
    def calculate_terrain_features(self, dem_path: str, boundary: gpd.GeoSeries) -> Dict[str, float]:
        """Calculate terrain-based risk factors."""
        with rasterio.open(dem_path) as src:
            # Create mask for the property boundary
            mask = geometry_mask(
                boundary.geometry,
                transform=src.transform,
                invert=True,
                out_shape=(src.height, src.width)
            )
            
            # Read elevation data
            elevation = src.read(1, masked=True)
            elevation.mask = ~mask
            
            # Calculate slope and aspect
            dx, dy = np.gradient(elevation)
            slope = np.arctan(np.sqrt(dx**2 + dy**2)) * 180 / np.pi
            aspect = np.arctan2(dy, dx) * 180 / np.pi
            
            return {
                'elevation': np.nanmean(elevation),
                'slope': np.nanmean(slope),
                'aspect': np.nanmean(aspect),
                'terrain_ruggedness': np.nanstd(elevation)
            }
    
    def get_weather_features(self, lat: float, lon: float, api_key: str) -> Dict[str, float]:
        """Fetch current weather data for risk assessment."""
        # This would connect to OpenWeather API or similar
        # For now, returning mock data
        return {
            'temperature': 28.5,
            'humidity': 35.0,
            'wind_speed': 15.2,
            'wind_direction': 225,
            'pressure': 1013.25,
            'days_since_rain': 12
        }
    
    def analyze_historical_fires(self, lat: float, lon: float, radius_km: float = 50) -> Dict[str, any]:
        """Analyze historical fire patterns in the area."""
        # This would query historical fire database
        # For now, returning mock data
        return {
            'historical_fires': 3,
            'avg_fire_size': 150.5,
            'last_fire_years_ago': 2.5,
            'fire_frequency': 0.6  # fires per year
        }
    
    def calculate_risk_score(self, property_data: Dict) -> Dict[str, any]:
        """
        Calculate comprehensive wildfire risk score for a property.
        
        Args:
            property_data: Dictionary containing property information
            
        Returns:
            Dictionary with risk score and detailed breakdown
        """
        try:
            # Extract all features
            features = []
            for feature_name in self.feature_names:
                features.append(property_data.get(feature_name, 0))
            
            # Normalize features
            features_array = np.array(features).reshape(1, -1)
            features_normalized = self.scaler.fit_transform(features_array)
            
            # Predict risk score
            risk_score = float(self.model.predict(features_normalized)[0][0])
            
            # Calculate component scores
            vegetation_risk = self._calculate_vegetation_risk(property_data)
            weather_risk = self._calculate_weather_risk(property_data)
            terrain_risk = self._calculate_terrain_risk(property_data)
            proximity_risk = self._calculate_proximity_risk(property_data)
            
            # Generate recommendations based on risk factors
            recommendations = self._generate_recommendations(
                risk_score, vegetation_risk, weather_risk, terrain_risk
            )
            
            # Simulate fire spread (simplified)
            fire_spread = self._simulate_fire_spread(property_data)
            
            return {
                'overall_risk_score': risk_score,
                'risk_level': self._get_risk_level(risk_score),
                'component_scores': {
                    'vegetation_risk': vegetation_risk,
                    'weather_risk': weather_risk,
                    'terrain_risk': terrain_risk,
                    'proximity_risk': proximity_risk
                },
                'recommendations': recommendations,
                'fire_spread_simulation': fire_spread,
                'confidence_score': 0.85,  # This would be calculated based on data quality
                'assessment_timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error calculating risk score: {str(e)}")
            raise
    
    def _calculate_vegetation_risk(self, data: Dict) -> float:
        """Calculate vegetation-based risk component."""
        ndvi = data.get('ndvi', 0)
        ndmi = data.get('ndmi', 0)
        fuel_moisture = data.get('fuel_moisture', 50)
        
        # Higher NDVI with low moisture = higher risk
        if ndvi > 0.6 and fuel_moisture < 30:
            vegetation_risk = 80
        elif ndvi > 0.4 and fuel_moisture < 40:
            vegetation_risk = 60
        elif ndvi > 0.2:
            vegetation_risk = 40
        else:
            vegetation_risk = 20
            
        return vegetation_risk
    
    def _calculate_weather_risk(self, data: Dict) -> float:
        """Calculate weather-based risk component."""
        temp = data.get('temperature', 20)
        humidity = data.get('humidity', 50)
        wind_speed = data.get('wind_speed', 0)
        days_since_rain = data.get('days_since_rain', 0)
        
        # Fire weather index calculation (simplified)
        weather_risk = 0
        
        if temp > 30:
            weather_risk += 25
        elif temp > 25:
            weather_risk += 15
            
        if humidity < 30:
            weather_risk += 25
        elif humidity < 40:
            weather_risk += 15
            
        if wind_speed > 20:
            weather_risk += 25
        elif wind_speed > 10:
            weather_risk += 15
            
        if days_since_rain > 14:
            weather_risk += 25
        elif days_since_rain > 7:
            weather_risk += 15
            
        return min(weather_risk, 100)
    
    def _calculate_terrain_risk(self, data: Dict) -> float:
        """Calculate terrain-based risk component."""
        slope = data.get('slope', 0)
        aspect = data.get('aspect', 0)
        
        terrain_risk = 0
        
        # Steeper slopes increase fire spread
        if slope > 30:
            terrain_risk += 40
        elif slope > 20:
            terrain_risk += 25
        elif slope > 10:
            terrain_risk += 15
            
        # South-facing slopes (in Northern Hemisphere) are typically drier
        if 135 <= aspect <= 225:  # South-facing
            terrain_risk += 20
            
        return terrain_risk
    
    def _calculate_proximity_risk(self, data: Dict) -> float:
        """Calculate risk based on proximity to resources and hazards."""
        distance_to_water = data.get('distance_to_water', 10)
        distance_to_road = data.get('distance_to_road', 1)
        population_density = data.get('population_density', 100)
        
        proximity_risk = 0
        
        # Further from water = higher risk
        if distance_to_water > 5:
            proximity_risk += 30
        elif distance_to_water > 2:
            proximity_risk += 20
            
        # Further from roads = harder access for firefighters
        if distance_to_road > 5:
            proximity_risk += 30
        elif distance_to_road > 2:
            proximity_risk += 20
            
        # Higher population density = more ignition sources
        if population_density > 1000:
            proximity_risk += 20
            
        return min(proximity_risk, 100)
    
    def _get_risk_level(self, risk_score: float) -> str:
        """Convert numeric risk score to risk level."""
        if risk_score >= 80:
            return "EXTREME"
        elif risk_score >= 60:
            return "HIGH"
        elif risk_score >= 40:
            return "MODERATE"
        elif risk_score >= 20:
            return "LOW"
        else:
            return "MINIMAL"
    
    def _generate_recommendations(self, risk_score: float, veg_risk: float, 
                                weather_risk: float, terrain_risk: float) -> List[Dict]:
        """Generate actionable recommendations based on risk factors."""
        recommendations = []
        
        if veg_risk > 60:
            recommendations.append({
                'priority': 'HIGH',
                'action': 'Vegetation Management',
                'description': 'Create defensible space by clearing vegetation within 30 feet of structures',
                'estimated_cost': 2500,
                'risk_reduction': 15
            })
            
        if risk_score > 70:
            recommendations.append({
                'priority': 'HIGH',
                'action': 'Install Sprinkler System',
                'description': 'Install rooftop sprinkler system for ember protection',
                'estimated_cost': 5000,
                'risk_reduction': 20
            })
            
        if terrain_risk > 50:
            recommendations.append({
                'priority': 'MEDIUM',
                'action': 'Create Fuel Breaks',
                'description': 'Establish fuel breaks on steep slopes to slow fire spread',
                'estimated_cost': 3500,
                'risk_reduction': 10
            })
            
        recommendations.append({
            'priority': 'MEDIUM',
            'action': 'Emergency Planning',
            'description': 'Develop and practice evacuation plan with multiple routes',
            'estimated_cost': 0,
            'risk_reduction': 5
        })
        
        return recommendations
    
    def _simulate_fire_spread(self, data: Dict) -> Dict:
        """Simulate potential fire spread patterns."""
        # Simplified fire spread simulation
        wind_speed = data.get('wind_speed', 10)
        wind_direction = data.get('wind_direction', 0)
        slope = data.get('slope', 0)
        
        # Calculate spread rate (simplified Rothermel model)
        base_spread_rate = 0.5  # km/hour
        wind_factor = 1 + (wind_speed / 20)
        slope_factor = 1 + (slope / 30)
        spread_rate = base_spread_rate * wind_factor * slope_factor
        
        return {
            'spread_rate_kmh': spread_rate,
            'primary_direction': wind_direction,
            'time_to_property_minutes': 60 / spread_rate,
            'evacuation_time_needed': 30,
            'safe_zones': ['North', 'Northeast']  # Based on wind direction
        }
    
    def train(self, training_data: pd.DataFrame, epochs: int = 100):
        """Train the model on historical wildfire data."""
        # Prepare features and labels
        X = training_data[self.feature_names].values
        y = training_data['risk_score'].values
        
        # Split data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        
        # Normalize features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        
        # Train model
        history = self.model.fit(
            X_train_scaled, y_train,
            validation_data=(X_val_scaled, y_val),
            epochs=epochs,
            batch_size=32,
            callbacks=[
                keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
                keras.callbacks.ReduceLROnPlateau(patience=5, factor=0.5)
            ]
        )
        
        logger.info(f"Model trained successfully. Final validation MAE: {history.history['val_mae'][-1]:.2f}")
        return history
    
    def save_model(self, path: str):
        """Save the trained model and scaler."""
        self.model.save(os.path.join(path, 'wildfire_risk_model.h5'))
        np.save(os.path.join(path, 'scaler_params.npy'), {
            'mean': self.scaler.mean_,
            'scale': self.scaler.scale_
        })
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        """Load a pre-trained model and scaler."""
        self.model = keras.models.load_model(os.path.join(path, 'wildfire_risk_model.h5'))
        scaler_params = np.load(os.path.join(path, 'scaler_params.npy'), allow_pickle=True).item()
        self.scaler.mean_ = scaler_params['mean']
        self.scaler.scale_ = scaler_params['scale']
        logger.info(f"Model loaded from {path}")