import re
import math
from typing import Dict, Any, List

# ================= SEMANTIC LEXICONS & CATEGORY DEFINITIONS =================
# Core categories mapped to distinct safety hazards
CATEGORY_LEXICONS: Dict[str, Dict[str, float]] = {
    "poor_lighting": {
        "streetlight": 2.5, "streetlights": 2.5, "light": 1.5, "lights": 1.5,
        "lighting": 2.0, "dark": 2.2, "darkness": 2.4, "pitch": 2.0, "dim": 1.8,
        "broken": 1.5, "fused": 2.2, "bulb": 1.8, "lamp": 1.8, "lamppost": 2.0,
        "blindspot": 1.8, "blackout": 2.0, "non-functional": 1.9, "shadow": 1.4,
        "off": 1.2, "unlit": 2.4, "visibility": 1.6
    },
    "harassment": {
        "harass": 2.8, "harassment": 3.0, "stalking": 3.2, "stalk": 3.0, "stalker": 3.2,
        "following": 2.6, "follow": 2.2, "chasing": 3.0, "chased": 3.0, "catcalling": 2.8,
        "eve-teasing": 3.0, "teasing": 2.0, "comment": 1.5, "comments": 1.8, "leering": 2.5,
        "drunk": 2.2, "drunkards": 2.4, "alcohol": 2.0, "loitering": 2.2, "gang": 2.2,
        "men": 1.3, "boys": 1.3, "threat": 2.8, "threatening": 3.0, "unsafe": 2.0,
        "touching": 3.5, "groping": 3.5, "abuse": 2.8, "abusing": 2.8, "misbehavior": 2.5
    },
    "isolated_area": {
        "isolated": 2.8, "deserted": 2.8, "empty": 2.0, "lonely": 2.2, "abandoned": 2.5,
        "canal": 2.0, "bypass": 2.0, "bushes": 2.2, "forest": 2.2, "jungle": 2.2,
        "unpaved": 1.8, "stretch": 1.5, "cut": 1.4, "secluded": 2.6, "no-one": 2.0,
        "nobody": 2.0, "quiet": 1.4, "remote": 2.2, "vacant": 2.0, "trail": 1.8,
        "dead-end": 2.0, "overgrown": 2.0
    },
    "no_police_patrol": {
        "police": 2.5, "pcr": 3.0, "patrol": 2.8, "patrolling": 2.8, "cop": 2.2,
        "cops": 2.2, "checkpoint": 2.5, "booth": 2.0, "officer": 2.0, "constable": 2.2,
        "station": 1.5, "security": 1.8, "guard": 1.8, "guards": 1.8, "surveillance": 1.8,
        "cctv": 2.0, "absent": 2.2, "missing": 2.0, "none": 1.4, "never": 1.6
    },
    "infrastructure_hazard": {
        "manhole": 3.0, "pothole": 2.2, "potholes": 2.2, "pavement": 1.8, "footpath": 1.8,
        "sidewalk": 1.8, "drain": 2.2, "open": 1.6, "wire": 2.4, "wires": 2.4,
        "underpass": 2.0, "waterlogged": 2.2, "waterlogging": 2.2, "flooded": 2.2,
        "slippery": 1.8, "debris": 1.8, "garbage": 1.6, "construction": 1.5, "blockage": 1.8
    }
}

# Tokens indicating immediate danger
HIGH_URGENCY_TOKENS = {
    "stalking": 3.0, "stalker": 3.0, "following": 2.5, "knife": 4.0, "weapon": 4.0,
    "attack": 3.5, "threat": 2.8, "terrified": 2.8, "scared": 2.2, "chased": 3.2,
    "groping": 3.8, "assault": 4.0, "screaming": 3.0, "pitch dark": 2.5, "emergency": 3.0
}

MODERATE_URGENCY_TOKENS = {
    "broken": 1.5, "dark": 1.8, "dim": 1.4, "loitering": 1.6, "comments": 1.5,
    "no police": 2.0, "deserted": 1.8, "isolated": 1.8, "empty": 1.4, "fused": 1.6
}

STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "could", "did", "do", "does", "doing", "down",
    "during", "each", "few", "for", "from", "further", "had", "has", "have", "having",
    "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i",
    "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most",
    "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
    "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
    "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
    "them", "themselves", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
    "when", "where", "which", "while", "who", "whom", "why", "with", "would",
    "you", "your", "yours", "yourself", "yourselves"
}

def tokenize_text(text: str) -> List[str]:
    """Clean and tokenize text string into lowercase alphabetical tokens."""
    clean = re.sub(r"[^a-zA-Z0-9\s\-]", " ", text.lower())
    tokens = clean.split()
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]

def classify_complaint_text(text: str) -> Dict[str, Any]:
    """
    NLP Classifier that extracts:
    - Primary category
    - Confidence score (0.0 to 1.0)
    - Severity rating (LOW, MODERATE, HIGH, CRITICAL)
    - Extracted salient keywords
    - Urgency flag
    """
    tokens = tokenize_text(text)
    raw_lower = text.lower()
    
    if not tokens:
        return {
            "category": "general_safety",
            "confidence": 0.50,
            "severity": "MODERATE",
            "keywords": [],
            "urgent_flag": False
        }

    # Score each category based on TF-IDF term weights
    scores: Dict[str, float] = {cat: 0.0 for cat in CATEGORY_LEXICONS}
    matched_keywords: List[str] = []

    for token in tokens:
        for cat, lexicon in CATEGORY_LEXICONS.items():
            if token in lexicon:
                scores[cat] += lexicon[token]
                if token not in matched_keywords:
                    matched_keywords.append(token)
            else:
                for lex_word, weight in lexicon.items():
                    if len(lex_word) >= 4 and (token.startswith(lex_word) or lex_word.startswith(token)):
                        scores[cat] += weight * 0.75
                        if token not in matched_keywords:
                            matched_keywords.append(token)
                        break

    best_cat = max(scores, key=lambda k: scores[k])
    max_score = scores[best_cat]

    if max_score > 0:
        total_score = sum(scores.values())
        confidence = min(0.98, round(max_score / (total_score + 0.01), 2))
        confidence = max(0.65, confidence)
    else:
        best_cat = "general_safety"
        confidence = 0.50

    urgency_score = 0.0
    for u_token, weight in HIGH_URGENCY_TOKENS.items():
        if u_token in raw_lower:
            urgency_score += weight

    for m_token, weight in MODERATE_URGENCY_TOKENS.items():
        if m_token in raw_lower:
            urgency_score += weight

    urgent_flag = urgency_score >= 3.0 or "stalk" in raw_lower or "weapon" in raw_lower or "knife" in raw_lower

    if urgency_score >= 3.5 or (best_cat == "harassment" and urgency_score >= 2.5):
        severity = "CRITICAL"
    elif urgency_score >= 2.0 or best_cat in ["harassment", "isolated_area"]:
        severity = "HIGH"
    elif urgency_score >= 1.0 or best_cat == "poor_lighting":
        severity = "MODERATE"
    else:
        severity = "LOW"

    return {
        "category": best_cat,
        "confidence": confidence,
        "severity": severity,
        "keywords": matched_keywords[:6],
        "urgent_flag": urgent_flag
    }

# ================= SPATIAL & SEMANTIC SIMILARITY ENGINE =================
SIMILARITY_DISTANCE_METERS = 300.0  # Max distance to consider for spatial clustering
SIMILARITY_SCORE_THRESHOLD = 0.45   # Minimum semantic similarity to group reports

def calculate_haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two geographic coordinates in meters.
    Zero external GIS C-library dependencies.
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def calculate_semantic_similarity(text1: str, text2: str) -> float:
    """
    Computes semantic similarity score between two texts using token set intersection,
    stem matching, category overlap, and shared hazard topic affinity.
    Returns float between 0.0 (unrelated) and 1.0 (identical/paraphrased).
    """
    tokens1 = set(tokenize_text(text1))
    tokens2 = set(tokenize_text(text2))

    if not tokens1 or not tokens2:
        return 0.0

    # 1. Direct exact token overlap
    intersection = tokens1.intersection(tokens2)

    # 2. Substring / stem overlap (e.g. "streetlight" vs "streetlights", "stalking" vs "stalker")
    stem_matches = 0
    for t1 in tokens1:
        if t1 not in intersection:
            for t2 in tokens2:
                if (len(t1) >= 4 and len(t2) >= 4 and (t1.startswith(t2) or t2.startswith(t1))):
                    stem_matches += 1
                    break

    # 3. Category & topic affinity
    res1 = classify_complaint_text(text1)
    res2 = classify_complaint_text(text2)
    cat1, cat2 = res1["category"], res2["category"]

    # Shared keywords from category lexicons
    kw1 = set(res1.get("keywords", []))
    kw2 = set(res2.get("keywords", []))
    shared_kw_overlap = len(kw1.intersection(kw2))

    enhanced_match_count = len(intersection) + (stem_matches * 0.75) + (shared_kw_overlap * 0.5)
    base_sim = enhanced_match_count / max(len(tokens1), len(tokens2))

    if cat1 == cat2 and cat1 != "general_safety":
        # Both describe the same hazard category in this area
        semantic_score = min(1.0, round(0.40 + (base_sim * 0.60), 2))
    else:
        semantic_score = min(1.0, round(base_sim, 2))

    return semantic_score

def find_duplicate_report(
    text: str,
    lat: float,
    lng: float,
    existing_reports: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Scans existing reports to find if a complaint is a duplicate or close duplicate
    within 300 meters and with >= 0.45 semantic similarity.
    """
    best_match = None
    highest_score = 0.0
    closest_distance = float("inf")

    for report in existing_reports:
        r_lat = report.get("lat")
        r_lng = report.get("lng")
        if r_lat is None or r_lng is None:
            continue

        dist = calculate_haversine_meters(lat, lng, r_lat, r_lng)
        if dist <= SIMILARITY_DISTANCE_METERS:
            sim = calculate_semantic_similarity(text, report.get("text", ""))
            if sim >= SIMILARITY_SCORE_THRESHOLD and sim > highest_score:
                highest_score = sim
                closest_distance = dist
                best_match = report

    if best_match:
        return {
            "is_duplicate": True,
            "similarity_score": highest_score,
            "distance_meters": round(closest_distance, 1),
            "matched_report": best_match,
            "cluster_id": best_match.get("cluster_id") or f"cl_{best_match.get('id')}"
        }

    return {
        "is_duplicate": False,
        "similarity_score": 0.0,
        "distance_meters": None,
        "matched_report": None,
        "cluster_id": None
    }

def group_reports_into_clusters(reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Aggregates list of individual complaints into spatial and semantic issue clusters.
    Returns clustered summaries with member count, primary category, and aggregated severity.
    """
    clusters: List[Dict[str, Any]] = []

    for r in reports:
        assigned = False
        r_lat = r.get("lat", 0.0)
        r_lng = r.get("lng", 0.0)
        r_text = r.get("text", "")
        r_cat = r.get("category", "general_safety")

        for cl in clusters:
            # Check proximity to cluster center
            dist = calculate_haversine_meters(r_lat, r_lng, cl["center_lat"], cl["center_lng"])
            sim = calculate_semantic_similarity(r_text, cl["headline"])
            if dist <= SIMILARITY_DISTANCE_METERS and (sim >= 0.35 or r_cat == cl["category"]):
                cl["reports"].append(r)
                cl["total_count"] += 1
                cl["upvotes_sum"] += r.get("upvotes", 1)
                if r.get("severity") == "CRITICAL" or cl["severity"] != "CRITICAL":
                    if r.get("severity") in ["CRITICAL", "HIGH"]:
                        cl["severity"] = r.get("severity")
                assigned = True
                break

        if not assigned:
            clusters.append({
                "cluster_id": r.get("cluster_id") or f"cl_{r.get('id', 'item')}",
                "category": r_cat,
                "headline": r_text[:80] + ("..." if len(r_text) > 80 else ""),
                "severity": r.get("severity", "MODERATE"),
                "center_lat": r_lat,
                "center_lng": r_lng,
                "total_count": 1,
                "upvotes_sum": r.get("upvotes", 1),
                "reports": [r],
                "first_reported_at": r.get("created_at")
            })

    return sorted(clusters, key=lambda c: (c["total_count"], c["upvotes_sum"]), reverse=True)

