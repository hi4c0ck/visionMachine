"""
VisionMachine - Simple API Server
FastAPI backend for video generation
Usage: python api_server.py
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import json
from datetime import datetime

app = FastAPI(
    title="VisionMachine API",
    description="AI-powered video generation service",
    version="0.1.0"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with SQLite in production)
videos = {}
users = {}

class GenerateRequest(BaseModel):
    prompt: str
    duration: int = 30
    shots: int = 6
    style: str = "cinematic"
    resolution: str = "1920x1080"
    user_id: str = "anonymous"

class GenerateResponse(BaseModel):
    success: bool
    video_url: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@app.get("/")
async def root():
    return {"message": "VisionMachine API", "status": "running"}

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/generate", response_model=GenerateResponse)
async def generate_video(request: GenerateRequest):
    """
    Generate video from prompt.
    Returns mock URL for now - integrate real AI provider later.
    """
    try:
        # Validate inputs
        if not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt cannot be empty")
        
        if request.duration < 3 or request.duration > 60:
            raise HTTPException(status_code=400, detail="Duration must be 3-60 seconds")
        
        if request.shots < 4 or request.shots > 12:
            raise HTTPException(status_code=400, detail="Shots must be 4-12")
        
        # Simulate generation (replace with real AI call)
        video_id = f"vm_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        video_url = f"/output/{video_id}.mp4"
        
        # Store metadata
        videos[video_id] = {
            "url": video_url,
            "prompt": request.prompt,
            "duration": request.duration,
            "shots": request.shots,
            "style": request.style,
            "resolution": request.resolution,
            "user_id": request.user_id,
            "created_at": datetime.now().isoformat()
        }
        
        return GenerateResponse(
            success=True,
            video_url=video_url,
            metadata={
                "id": video_id,
                "prompt": request.prompt,
                "duration": request.duration
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/videos/{video_id}")
async def get_video(video_id: str):
    """Get video metadata"""
    if video_id not in videos:
        raise HTTPException(status_code=404, detail="Video not found")
    return videos[video_id]

@app.get("/videos")
async def list_videos(user_id: str = "anonymous"):
    """List videos for user"""
    user_videos = [v for v in videos.values() if v.get('user_id') == user_id]
    return sorted(user_videos, key=lambda x: x['created_at'], reverse=True)

@app.delete("/videos/{video_id}")
async def delete_video(video_id: str):
    """Delete a video"""
    if video_id not in videos:
        raise HTTPException(status_code=404, detail="Video not found")
    del videos[video_id]
    return {"success": True}

@app.get("/user/{user_id}")
async def get_user(user_id: str):
    """Get user info"""
    if user_id not in users:
        users[user_id] = {
            "id": user_id,
            "created_at": datetime.now().isoformat(),
            "videos_count": 0
        }
    user = users[user_id]
    user["videos_count"] = len([v for v in videos.values() if v.get('user_id') == user_id])
    return user

if __name__ == '__main__':
    import uvicorn
    # Using non-standard port to avoid conflicts
    uvicorn.run(app, host="127.0.0.1", port=8765)
