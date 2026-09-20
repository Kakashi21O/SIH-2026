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
            'name': 'Via Panchkuian Marg & Pusa Road (Main Boulevard)',
            'type': 'SAFER',
            'is_recommended': True,
            'distance_km': 3.6,
            'duration_mins': 15,
            'safety_score': 89,
            'risk_level': 'LOW',
            'lighting_rating': '95% Well-Lit Commercial Corridor',
            'police_presence': '2 Checkpoints and PCR Booth',
            'active_safesteps_users': 42,
            'description': 'Follows brightly lit commercial avenue with continuous CCTV coverage, open shops, and regular police patrols along Panchkuian & Pusa Road.',
            'color': '#10B981',
            'steps': [
                {'instruction': 'Head west on Radial Rd 4 towards Connaught Circus', 'distance': '350m', 'maneuver': 'straight'},
                {'instruction': 'Continue onto Panchkuian Marg', 'distance': '1.1 km', 'maneuver': 'straight'},
                {'instruction': 'Slight right towards Jhandewalan / DB Gupta Rd', 'distance': '600m', 'maneuver': 'slight-right'},
                {'instruction': 'Continue straight on Faiz Road towards Karol Bagh', 'distance': '900m', 'maneuver': 'straight'},
                {'instruction': 'Turn left onto Gurudwara Road', 'distance': '450m', 'maneuver': 'turn-left'},
                {'instruction': 'Arrive safely at Karol Bagh Residence', 'distance': '0m', 'maneuver': 'arrive'}
            ],
            'waypoints': [
                [28.6315, 77.2190],
                [28.6338, 77.2145],
                [28.6362, 77.2098],
                [28.6385, 77.2052],
                [28.6410, 77.2008],
                [28.6438, 77.1965],
                [28.6465, 77.1932],
                [28.6492, 77.1912],
                [28.6520, 77.1900]
            ],
            'safe_havens': ['Connaught Place Police Station', 'Safe Haven 24/7 Metro Booth']
        },
        'fastest_route': {
            'id': 'rt_fastest_1',
            'name': 'Via DB Gupta Road & Railway Underpass Shortcut',
            'type': 'FASTEST',
            'is_recommended': False,
            'distance_km': 2.8,
            'duration_mins': 10,
            'safety_score': 44,
            'risk_level': 'HIGH',
            'lighting_rating': '40% Dimly Lit / Underpass Dark Stretches',
            'police_presence': 'No Static Posts',
            'active_safesteps_users': 4,
            'description': 'Shorter distance via DB Gupta road shortcut but crosses unmonitored railway underpass cut with low visibility at night.',
            'color': '#F97316',
            'steps': [
                {'instruction': 'Head northwest on Chelmsford Rd towards Paharganj', 'distance': '500m', 'maneuver': 'straight'},
                {'instruction': 'Turn right through Railway Underpass Cut', 'distance': '700m', 'maneuver': 'turn-right'},
                {'instruction': 'Pass isolated DB Gupta Road alleyway', 'distance': '850m', 'maneuver': 'straight'},
                {'instruction': 'Turn left onto Arya Samaj Road', 'distance': '550m', 'maneuver': 'turn-left'},
                {'instruction': 'Arrive at Karol Bagh Residence', 'distance': '0m', 'maneuver': 'arrive'}
            ],
            'waypoints': [
                [28.6315, 77.2190],
                [28.6360, 77.2170],
                [28.6415, 77.2140],
                [28.6455, 77.2085],
                [28.6488, 77.1995],
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
            'name': 'Via University Road & Mall Road Corridor',
            'type': 'SAFER',
            'is_recommended': True,
            'distance_km': 2.8,
            'duration_mins': 14,
            'safety_score': 91,
            'risk_level': 'LOW',
            'lighting_rating': '100% Streetlight & Campus Patrol Coverage',
            'police_presence': 'Active University Patrol & PCR',
            'active_safesteps_users': 68,
            'description': 'Main university arterial road with frequent e-rickshaws, student transit, and emergency help kiosks along Mall Road.',
            'color': '#10B981',
            'steps': [
                {'instruction': 'Head southeast on Chhatra Marg towards University Rd', 'distance': '400m', 'maneuver': 'straight'},
                {'instruction': 'Turn left onto Vishwavidyalaya Marg / Mall Rd', 'distance': '900m', 'maneuver': 'turn-left'},
                {'instruction': 'Continue straight along Metro Corridor', 'distance': '750m', 'maneuver': 'straight'},
                {'instruction': 'Turn right towards Civil Lines Sham Nath Marg', 'distance': '550m', 'maneuver': 'turn-right'},
                {'instruction': 'Arrive safely at Civil Lines Hostel', 'distance': '0m', 'maneuver': 'arrive'}
            ],
            'waypoints': [
                [28.6880, 77.2090],
                [28.6852, 77.2120],
                [28.6825, 77.2155],
                [28.6798, 77.2192],
                [28.6775, 77.2222],
                [28.6750, 77.2250]
            ],
            'safe_havens': ['Vishwavidyalaya Metro Safe Zone']
        },
        'fastest_route': {
            'id': 'rt_fastest_2',
            'name': 'Via Ridge Forest Backroad (High Hazard)',
            'type': 'FASTEST',
            'is_recommended': False,
            'distance_km': 2.1,
            'duration_mins': 9,
            'safety_score': 36,
            'risk_level': 'HIGH',
            'lighting_rating': '25% Dark Isolated Stretch',
            'police_presence': 'Isolated',
            'active_safesteps_users': 1,
            'description': 'Isolated ridge passage with complete lack of street lighting and emergency support after dusk.',
            'color': '#EF4444',
            'steps': [
                {'instruction': 'Head south through Ridge Service Road', 'distance': '650m', 'maneuver': 'straight'},
                {'instruction': 'Traverse dark unlit Ridge Path', 'distance': '800m', 'maneuver': 'straight'},
                {'instruction': 'Exit towards Civil Lines rear cut', 'distance': '500m', 'maneuver': 'slight-left'},
                {'instruction': 'Arrive at Civil Lines Hostel', 'distance': '0m', 'maneuver': 'arrive'}
            ],
            'waypoints': [
                [28.6880, 77.2090],
                [28.6828, 77.2108],
                [28.6785, 77.2145],
                [28.6762, 77.2205],
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
