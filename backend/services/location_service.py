import uuid
from typing import Dict, Any, List
from backend.services.risk_engine import evaluate_location_risk
from backend.database.database import get_db_connection

ROUTE_PRESETS = {
    'cp_to_karolbagh': {
        'origin': {'name': 'Connaught Place Metro', 'lat': 28.6315, 'lng': 77.2190},
        'destination': {'name': 'Karol Bagh Residence', 'lat': 28.6520, 'lng': 77.1900},
        'safer_route': {
            'id': 'rt_safer_1',
            'name': 'Via Pusa Road and Police Assistance Booth',
            'type': 'SAFER',
            'is_recommended': True,
            'distance_km': 3.4,
            'duration_mins': 16,
            'safety_score': 89,
            'risk_level': 'LOW',
            'lighting_rating': '95% Well-Lit Boulevard',
            'police_presence': '2 Checkpoints and PCR Booth',
            'active_safesteps_users': 42,
            'description': 'Follows brightly lit commercial avenue with continuous CCTV coverage, open shops, and regular police patrols.',
            'color': '#10B981',
            'waypoints': [
                [28.6315, 77.2190],
                [28.6350, 77.2110],
                [28.6390, 77.2020],
                [28.6440, 77.1960],
                [28.6485, 77.1920],
                [28.6520, 77.1900]
            ],
            'safe_havens': ['Connaught Place Police Station', 'Safe Haven 24/7 Metro Booth']
        },
        'fastest_route': {
            'id': 'rt_fastest_1',
            'name': 'Via Railway Underpass Cut',
            'type': 'FASTEST',
            'is_recommended': False,
            'distance_km': 2.7,
            'duration_mins': 11,
            'safety_score': 44,
            'risk_level': 'HIGH',
            'lighting_rating': '40% Dimly Lit / Broken Lights',
            'police_presence': 'No Static Posts',
            'active_safesteps_users': 4,
            'description': 'Shorter distance but traverses isolated railway underpass with multiple dark stretches and low foot traffic after 8 PM.',
            'color': '#F97316',
            'waypoints': [
                [28.6315, 77.2190],
                [28.6395, 77.2315],
                [28.6460, 77.2210],
                [28.6500, 77.2050],
                [28.6520, 77.1900]
            ],
            'safe_havens': []
        }
    },
    'campus_to_hostel': {
        'origin': {'name': 'North Campus Library', 'lat': 28.6880, 'lng': 77.2090},
        'destination': {'name': 'Civil Lines Hostel', 'lat': 28.6750, 'lng': 77.2250},
        'safer_route': {
            'id': 'rt_safer_2',
            'name': 'Via Mall Road and Metro Corridor',
            'type': 'SAFER',
            'is_recommended': True,
            'distance_km': 2.8,
            'duration_mins': 14,
            'safety_score': 91,
            'risk_level': 'LOW',
            'lighting_rating': '100% Streetlight Coverage',
            'police_presence': 'Active University Patrol',
            'active_safesteps_users': 68,
            'description': 'Main university arterial road with frequent e-rickshaws, student transit, and emergency help kiosks.',
            'color': '#10B981',
            'waypoints': [
                [28.6880, 77.2090],
                [28.6830, 77.2140],
                [28.6790, 77.2190],
                [28.6750, 77.2250]
            ],
            'safe_havens': ['Vishwavidyalaya Metro Safe Zone']
        },
        'fastest_route': {
            'id': 'rt_fastest_2',
            'name': 'Via Ridge Backroad Trail',
            'type': 'FASTEST',
            'is_recommended': False,
            'distance_km': 2.1,
            'duration_mins': 9,
            'safety_score': 36,
            'risk_level': 'HIGH',
            'lighting_rating': '25% Dark Forest Stretch',
            'police_presence': 'Isolated',
            'active_safesteps_users': 1,
            'description': 'Unpaved trail through the ridge. High hazard rating due to complete absence of lighting and emergency assistance.',
            'color': '#EF4444',
            'waypoints': [
                [28.6880, 77.2090],
                [28.6810, 77.2110],
                [28.6770, 77.2180],
                [28.6750, 77.2250]
            ],
            'safe_havens': []
        }
    }
}

def compare_routes(origin_query: str = '', dest_query: str = '') -> Dict[str, Any]:
    preset_key = 'cp_to_karolbagh'
    if 'campus' in origin_query.lower() or 'hostel' in dest_query.lower() or 'north' in origin_query.lower():
        preset_key = 'campus_to_hostel'

    preset = ROUTE_PRESETS[preset_key]
    return {
        'preset_id': preset_key,
        'origin': preset['origin'],
        'destination': preset['destination'],
        'safer_route': preset['safer_route'],
        'fastest_route': preset['fastest_route'],
        'recommendation_reason': 'Safer Route chosen: 45+ higher Safety Index, passes 2 Safe Havens with verified continuous illumination.'
    }

def start_journey_session(user_id: str, origin_name: str, dest_name: str, route_type: str, safety_score: int) -> Dict[str, Any]:
    journey_id = f'jrn_{uuid.uuid4().hex[:8]}'
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO journeys (id, user_id, origin_name, dest_name, selected_route_type, safety_score, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (journey_id, user_id, origin_name, dest_name, route_type, safety_score, 'ACTIVE')
    )
    conn.commit()
    conn.close()

    return {
        'journey_id': journey_id,
        'status': 'ACTIVE',
        'message': f'Safe Journey started via {route_type} route. Continuous geofence tracking active.'
    }
