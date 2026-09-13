from fastapi import APIRouter
from backend.models.schemas import RouteCompareRequest, JourneyStartRequest
from backend.services.location_service import compare_routes, start_journey_session

router = APIRouter(prefix='/api/location', tags=['Location and Safe Journey'])

@router.post('/routes/compare')
def get_route_comparison(payload: RouteCompareRequest):
    return compare_routes(payload.origin, payload.destination)

@router.post('/journey/start')
def start_journey(payload: JourneyStartRequest):
    return start_journey_session(
        user_id=payload.user_id,
        origin_name=payload.origin_name,
        dest_name=payload.dest_name,
        route_type=payload.selected_route_type,
        safety_score=payload.safety_score
    )
