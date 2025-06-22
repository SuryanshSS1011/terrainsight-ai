import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import * as turf from '@turf/turf';
import { Box, IconButton, Tooltip, Paper, Typography, Chip } from '@mui/material';
import {
    Layers,
    MyLocation,
    ZoomIn,
    ZoomOut,
    Fullscreen,
    Timeline,
    LocalFireDepartment,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN || '';

interface Property {
    id: string;
    address: string;
    center_point: {
        type: string;
        coordinates: [number, number];
    };
    boundary?: {
        type: string;
        coordinates: number[][][];
    };
    current_risk_score: number;
    last_assessment_date?: string;
}

interface RiskMapProps {
    properties: Property[];
    selectedPropertyId?: string;
    onPropertySelect?: (propertyId: string) => void;
    height?: number | string;
    showControls?: boolean;
    showLegend?: boolean;
    showFireData?: boolean;
    showWeatherOverlay?: boolean;
    enableDrawing?: boolean;
}

export const RiskMap: React.FC<RiskMapProps> = ({
    properties,
    selectedPropertyId,
    onPropertySelect,
    height = 500,
    showControls = true,
    showLegend = true,
    showFireData = false,
    showWeatherOverlay = false,
    enableDrawing = false,
}) => {
    const theme = useTheme();
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const draw = useRef<MapboxDraw | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [activeLayer, setActiveLayer] = useState<'risk' | 'satellite' | 'terrain'>('risk');
    const [showFirePerimeters, setShowFirePerimeters] = useState(showFireData);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: theme.palette.mode === 'dark'
                ? 'mapbox://styles/mapbox/dark-v11'
                : 'mapbox://styles/mapbox/light-v11',
            center: [-122.4194, 37.7749], // Default to SF
            zoom: 10,
            pitch: 0,
            bearing: 0,
        });

        // Add navigation controls
        if (showControls) {
            map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
            map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-right');
        }

        // Add drawing controls if enabled
        if (enableDrawing) {
            draw.current = new MapboxDraw({
                displayControlsDefault: false,
                controls: {
                    polygon: true,
                    trash: true,
                },
                defaultMode: 'simple_select',
            });
            map.current.addControl(draw.current as any, 'top-left');
        }

        map.current.on('load', () => {
            setMapLoaded(true);

            // Add terrain
            map.current!.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14,
            });

            map.current!.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });

            // Add 3D buildings
            map.current!.addLayer({
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 15,
                paint: {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': ['get', 'min_height'],
                    'fill-extrusion-opacity': 0.6,
                },
            });
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [theme.palette.mode, showControls, enableDrawing]);

    // Update properties on map
    useEffect(() => {
        if (!map.current || !mapLoaded || !properties.length) return;

        // Remove existing sources and layers
        if (map.current.getSource('properties')) {
            map.current.removeLayer('property-fills');
            map.current.removeLayer('property-borders');
            map.current.removeLayer('property-points');
            map.current.removeSource('properties');
        }

        // Create GeoJSON from properties
        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: properties.map(property => ({
                type: 'Feature' as const,
                id: property.id,
                geometry: property.boundary ? {
                    type: 'Polygon' as const,
                    coordinates: property.boundary.coordinates
                } : {
                    type: 'Point' as const,
                    coordinates: property.center_point.coordinates
                },
                properties: {
                    id: property.id,
                    address: property.address,
                    risk_score: property.current_risk_score,
                    risk_level: getRiskLevel(property.current_risk_score),
                },
            })),
        };

        // Add source
        map.current.addSource('properties', {
            type: 'geojson',
            data: geojson,
        });

        // Add fill layer for property boundaries
        map.current.addLayer({
            id: 'property-fills',
            type: 'fill',
            source: 'properties',
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'fill-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'risk_score'],
                    0, '#00ff00',
                    30, '#ffff00',
                    60, '#ff9900',
                    80, '#ff0000',
                    100, '#8b0000',
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false],
                    0.8,
                    0.5,
                ],
            },
        });

        // Add border layer
        map.current.addLayer({
            id: 'property-borders',
            type: 'line',
            source: 'properties',
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'line-color': '#000',
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false],
                    3,
                    1,
                ],
            },
        });

        // Add points for properties without boundaries
        map.current.addLayer({
            id: 'property-points',
            type: 'circle',
            source: 'properties',
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10, 8,
                    15, 20,
                ],
                'circle-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'risk_score'],
                    0, '#00ff00',
                    30, '#ffff00',
                    60, '#ff9900',
                    80, '#ff0000',
                    100, '#8b0000',
                ],
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
            },
        });

        // Add click handlers
        ['property-fills', 'property-points'].forEach(layer => {
            map.current!.on('click', layer, (e) => {
                if (e.features && e.features[0]) {
                    const propertyId = e.features[0].properties?.id;
                    if (propertyId && onPropertySelect) {
                        onPropertySelect(propertyId);
                    }

                    // Show popup
                    const property = properties.find(p => p.id === propertyId);
                    if (property) {
                        new mapboxgl.Popup()
                            .setLngLat(e.lngLat)
                            .setHTML(`
                <div style="padding: 10px;">
                  <h3 style="margin: 0 0 10px 0;">${property.address}</h3>
                  <p style="margin: 5px 0;">Risk Score: <strong>${property.current_risk_score}</strong></p>
                  <p style="margin: 5px 0;">Risk Level: <strong>${getRiskLevel(property.current_risk_score)}</strong></p>
                </div>
              `)
                            .addTo(map.current!);
                    }
                }
            });

            // Add hover effects
            map.current!.on('mouseenter', layer, () => {
                map.current!.getCanvas().style.cursor = 'pointer';
            });

            map.current!.on('mouseleave', layer, () => {
                map.current!.getCanvas().style.cursor = '';
            });
        });

        // Fit bounds to show all properties
        if (properties.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            properties.forEach(property => {
                if (property.boundary) {
                    property.boundary.coordinates[0].forEach(coord => {
                        bounds.extend(coord as [number, number]);
                    });
                } else {
                    bounds.extend(property.center_point.coordinates);
                }
            });

            map.current.fitBounds(bounds, { padding: 50 });
        }
    }, [properties, mapLoaded, onPropertySelect]);

    // Handle selected property
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Reset all selected states
        properties.forEach(property => {
            map.current!.setFeatureState(
                { source: 'properties', id: property.id },
                { selected: false }
            );
        });

        // Set selected state
        if (selectedPropertyId) {
            map.current.setFeatureState(
                { source: 'properties', id: selectedPropertyId },
                { selected: true }
            );

            // Center on selected property
            const property = properties.find(p => p.id === selectedPropertyId);
            if (property) {
                map.current.flyTo({
                    center: property.center_point.coordinates,
                    zoom: 15,
                    duration: 1000,
                });
            }
        }
    }, [selectedPropertyId, properties, mapLoaded]);

    // Add fire perimeters layer
    useEffect(() => {
        if (!map.current || !mapLoaded || !showFirePerimeters) return;

        // Fetch active fire data
        fetch('/api/fires/active')
            .then(res => res.json())
            .then(data => {
                if (map.current!.getSource('fire-perimeters')) {
                    (map.current!.getSource('fire-perimeters') as mapboxgl.GeoJSONSource).setData(data);
                } else {
                    map.current!.addSource('fire-perimeters', {
                        type: 'geojson',
                        data: data,
                    });

                    map.current!.addLayer({
                        id: 'fire-fills',
                        type: 'fill',
                        source: 'fire-perimeters',
                        paint: {
                            'fill-color': '#ff0000',
                            'fill-opacity': 0.4,
                        },
                    });

                    map.current!.addLayer({
                        id: 'fire-borders',
                        type: 'line',
                        source: 'fire-perimeters',
                        paint: {
                            'line-color': '#ff0000',
                            'line-width': 2,
                        },
                    });
                }
            });
    }, [showFirePerimeters, mapLoaded]);

    // Helper functions
    const getRiskLevel = (score: number): string => {
        if (score >= 80) return 'Extreme';
        if (score >= 60) return 'High';
        if (score >= 40) return 'Moderate';
        if (score >= 20) return 'Low';
        return 'Minimal';
    };

    const getRiskColor = (score: number): string => {
        if (score >= 80) return '#8b0000';
        if (score >= 60) return '#ff0000';
        if (score >= 40) return '#ff9900';
        if (score >= 20) return '#ffff00';
        return '#00ff00';
    };

    const handleLayerSwitch = (layer: 'risk' | 'satellite' | 'terrain') => {
        if (!map.current) return;

        setActiveLayer(layer);

        switch (layer) {
            case 'satellite':
                map.current.setStyle('mapbox://styles/mapbox/satellite-v9');
                break;
            case 'terrain':
                map.current.setStyle('mapbox://styles/mapbox/outdoors-v11');
                break;
            default:
                map.current.setStyle(
                    theme.palette.mode === 'dark'
                        ? 'mapbox://styles/mapbox/dark-v11'
                        : 'mapbox://styles/mapbox/light-v11'
                );
        }
    };

    const handleLocationClick = () => {
        if (!map.current) return;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    map.current!.flyTo({
                        center: [position.coords.longitude, position.coords.latitude],
                        zoom: 14,
                    });
                },
                (error) => {
                    console.error('Error getting location:', error);
                }
            );
        }
    };

    return (
        <Box position="relative" height={height}>
            <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

            {/* Map Controls */}
            {showControls && (
                <Paper
                    sx={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        p: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                    }}
                >
                    <Tooltip title="Switch Layers">
                        <IconButton
                            size="small"
                            onClick={() => {
                                const layers: ('risk' | 'satellite' | 'terrain')[] = ['risk', 'satellite', 'terrain'];
                                const currentIndex = layers.indexOf(activeLayer);
                                const nextIndex = (currentIndex + 1) % layers.length;
                                handleLayerSwitch(layers[nextIndex]);
                            }}
                        >
                            <Layers />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="My Location">
                        <IconButton size="small" onClick={handleLocationClick}>
                            <MyLocation />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Toggle Fire Data">
                        <IconButton
                            size="small"
                            color={showFirePerimeters ? 'error' : 'default'}
                            onClick={() => setShowFirePerimeters(!showFirePerimeters)}
                        >
                            <LocalFireDepartment />
                        </IconButton>
                    </Tooltip>
                </Paper>
            )}

            {/* Legend */}
            {showLegend && (
                <Paper
                    sx={{
                        position: 'absolute',
                        bottom: 16,
                        left: 16,
                        p: 2,
                        maxWidth: 200,
                    }}
                >
                    <Typography variant="subtitle2" gutterBottom>
                        Risk Levels
                    </Typography>
                    {[
                        { level: 'Extreme', color: '#8b0000', range: '80-100' },
                        { level: 'High', color: '#ff0000', range: '60-79' },
                        { level: 'Moderate', color: '#ff9900', range: '40-59' },
                        { level: 'Low', color: '#ffff00', range: '20-39' },
                        { level: 'Minimal', color: '#00ff00', range: '0-19' },
                    ].map(item => (
                        <Box key={item.level} display="flex" alignItems="center" mb={0.5}>
                            <Box
                                sx={{
                                    width: 20,
                                    height: 20,
                                    backgroundColor: item.color,
                                    mr: 1,
                                    borderRadius: 0.5,
                                }}
                            />
                            <Typography variant="caption">
                                {item.level} ({item.range})
                            </Typography>
                        </Box>
                    ))}
                </Paper>
            )}
        </Box>
    );
};